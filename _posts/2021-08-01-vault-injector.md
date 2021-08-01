---
layout: post
title: 쿠버네티스 환경에서 Vault 활용하기 2편(Vault Injector)
categories: [Vault]
tags: [Vault]
comments: true
---

- [개요](#개요)
- [용어정리](#용어정리)
- [Vault Agent Injector](#vault-agent-injector)
- [예제](#예제)
  - [민감데이터 저장](#민감데이터-저장)
  - [Vault 인증 설정 및 RBAC로 권한부여](#vault-인증-설정-및-rbac로-권한부여)
  - [Vault Injector 사용](#vault-injector-사용)
  - [검증](#검증)

## 개요
쿠버네티스 환경에서 Vault 활용하기 1편에서 Vault를 설치하고 설치검증을 진행했다.

2편에서는 Hashicorp의 Vault Injector를 사용해 Vault에 저장된 민감 데이터를 주입해보자.

## 용어정리
- annotation(어노테이션) : 레이블은 특정 오브젝트를 식별하기 위해서 지정하지만 어노테이션은 오브젝트에 정보(메타데이터)를 전달하기 위해서 존재한다.
- sidecar contatiner : 사이드카 컨테이너는 기존의 컨테이너에 추가적인 기능을(로깅, 파일관리, 프록시 등) 확장 혹은 개선을 위해 같은 pod내에 존재하는 컨테이너를 의미한다.

  즉 원래 컨테이너를 변경시키지않고도 추가적인 기능을 하는 에드온 컨테이너라고 생각하면 쉽다.
- mutating webhook : kube-api-server로 오는 요청을 가로챈뒤 특정 요청들을 mutating(변형)해 새로운 오브젝트 생성, spec의 수정 등을 수행한다.
  ![mutating webhook](https://d33wubrfki0l68.cloudfront.net/af21ecd38ec67b3d81c1b762221b4ac777fcf02d/7c60e/images/blog/2019-03-21-a-guide-to-kubernetes-admission-controllers/admission-controller-phases.png)

<center>
<a href="https://kubernetes.io/blog/2019/03/21/a-guide-to-kubernetes-admission-controllers/">출처 : kubernetes blog</a>
</center>

- sidecar injection : mutating webhook을 사용해 특정 pod에 sidecar container를 넣는 행위를 말한다.
- init container : pod의 container 생성전에 실행되며 contatiner에서 사용할 플러그인 다운로드, 볼륨에 대한 권한설정 등을 진행한뒤 종료한다.

## Vault Agent Injector
[Vault Agent Injector](https://www.vaultproject.io/docs/platform/k8s/injector)는 Pod의 Create, Update 요청시 특정 어노테이션인 `vault.hashicorp.com/agent-inject: true`이 존재하는 경우,

[Kubernetes Mutating Webhook](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)을 사용하여 Pod에 Vault data를 init container와 sidecar injection을 통해 주입한다.

주입된 민감데이터는 메모리볼륨으로 공유되며 `/vault/secrets`에 마운트된다.

init container는 Vault에서 민감 데이터를 가져오는 역할을 한다.

sidecar container는 Init container에서 가져온 정보를 주기적으로 동기화 하는 역할을 한다.



## 예제

예저는 3가지로 나눠서 진행된다.
1. 민감데이터 저장
2. Vault 인증 설정 및 RBAC로 권한부여
3. Vault Injector로 Vault에서 값 가져오기

### 민감데이터 저장

1.  Vault login
    ```bash
    kubectl exec -it vault-0 -- /bin/sh -n vault
    vault login
    # root token으로 로그인
    ```
2.  K/V Engine 생성 후 민감데이터 저장
    ```bash
    # 이름이 secret인 K/V 엔진 생성
    $ vault secrets enable -path=secret kv-v2
    Success! Enabled the kv-v2 secrets engine at: secret/
    # secret에 민감데이터 저장
    $ vault kv put secret/test ID="test" password="passwd"
    Key              Value
    ---              -----
    created_time     2021-08-01T12:13:34.1045987Z
    deletion_time    n/a
    destroyed        false
    version          1
    # 저장된 데이터 확인
    $ vault kv get secret/test
    ====== Metadata ======
    Key              Value
    ---              -----
    created_time     2021-08-01T12:13:34.1045987Z
    deletion_time    n/a
    destroyed        false
    version          1

    ====== Data ======
    Key         Value
    ---         -----
    ID          test
    password    passwd
    ```

### Vault 인증 설정 및 RBAC로 권한부여

Vault Injector가 생성한 Pod의 init container와 sidecar container가 인증 받아야 하기 때문에 Kubernetes 인증관련 설정을 진행한다.

Kubernetes 인증은 Service Account의 토큰을 읽어 **해당 토큰이 특정 네임스페이스들에 특정 이름들을 가지고 있는지로 검증한다.**

ex) 아래 설정의 경우 test, default 네임스페이스의 vault, vault-atuh 서비스어카운트만이 인증 가능하다.
- 서비스어카운트 이름 : vault, vault-auth
- 네임스페이스 : test, default


이때 토큰정보를 읽을 수 있도록 `token_reviewer`가 필요하게 되고 여기서는 vault statefulset에 마운트된 ServiceAccount인 `vault`서비스 어카운트로 토큰정보를 읽도록 설정한다.



1.  Kubernetes Auth 활성화 및 설정
    ```bash
    # kubernetes 인증 활성화
    $ vault auth enable kubernetes
    Success! Enabled kubernetes auth method at: kubernetes/
    # kubernetes 인증 설정
    $ vault write auth/kubernetes/config \
      token_reviewer_jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
      kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443" \
      kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    # 밑에는 출력
    Success! Data written to: auth/kubernetes/config
    ```
2.  Policy 생성 및 Role 연결
    ```bash
    # secret-read policy 생성
    $ vault policy write secret-read - <<EOF
    path "secret/*" {
      capabilities = ["read"]
    }
    EOF
    # scret-read policy와 kubernetes interanl-app role 연결
    # vault-test 네임스페이스에 vault-secret-read 서비스어카운트에게 권한부여
    $ vault write auth/kubernetes/role/internal-app \
    bound_service_account_names=vault-secret-read \
    bound_service_account_namespaces=vault-test \
    policies=secret-read \
    ttl=24h
    ```

### Vault Injector 사용

Vault Injector가 Init Container와 Sidecar 주입시 Vault Agent가 실행되며 아래 다이어그램의 프로세스를 거쳐 인증 및 데이터 fetch가 진행된다.

![프로세스](https://www.datocms-assets.com/2885/1578078487-screen-shot-2020-01-03-at-19-07-14.png?fit=max&q=80&w=2000)

<center>

<a href="https://www.hashicorp.com/blog/dynamic-database-credentials-with-vault-and-kubernetes">출처 : Hashicorp 공식 블로그</a>

</center>

1.  네임스페이스 생성

    아래에서 생성하는 네임스페이스는 [Vault 인증 설정 및 RBAC로 권한부여](#vault-인증-설정-및-rbac로-권한부여)의 2번에 `bound_service_account_namespaces`와 일치해야한다.
    ```bash
    kubectl create ns vault-test
    kubectl config set-context --current --namespace=vault-test
    ```
2.  서비스 어카운트 생성

    아래에서 생성하는 서비스어카운트는 [Vault 인증 설정 및 RBAC로 권한부여](#vault-인증-설정-및-rbac로-권한부여)의 2번에 `bound_service_account_names`와 일치해야한다.
    ```bash
    kubectl create sa vault-secret-read
    ```
3.  테스트를 위한 Deployment 생성
    ```bash
    kubectl apply -f - <<EOF
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      labels:
        app: vault-injector-test
      name: vault-injector-test
      namespace: vault-test
    spec:
      progressDeadlineSeconds: 600
      replicas: 1
      revisionHistoryLimit: 10
      selector:
        matchLabels:
          app: vault-injector-test
      strategy:
        rollingUpdate:
          maxSurge: 25%
          maxUnavailable: 25%
        type: RollingUpdate
      template:
        metadata:
          annotations:
            vault.hashicorp.com/agent-inject: "true"
            vault.hashicorp.com/agent-inject-secret-test: secret/data/test
            vault.hashicorp.com/agent-inject-status: update
            vault.hashicorp.com/role: internal-app
          labels:
            app: vault-injector-test
        spec:
          serviceAccountName: vault-secret-read
          containers:
          - image: alpine
            command:
              - "sh"
              - "-c"
              - "cat /vault/secrets/test && sleep 10000"
            imagePullPolicy: Always
            name: vault-injector-test
            resources: {}
            terminationMessagePath: /dev/termination-log
            terminationMessagePolicy: File
          dnsPolicy: ClusterFirst
          restartPolicy: Always
          schedulerName: default-scheduler
          securityContext: {}
          terminationGracePeriodSeconds: 30
    EOF
    ```
### 검증
1.  Vault Inector 작동확인
    ```bash
    $ kubectl get pod
    NAME                                   READY   STATUS     RESTARTS   AGE
    vault-injector-test-5569487848-kpgq4   0/2     Init:0/1   0          27s
    ```
    `kubectl get pod`으로 Ready 항목에 (0|1|2)/2라고 되어있으면 Vault Injector가 Sidecar Inejction을 수행한 것이다.
2.  값 확인
    ```bash
    kubectl exec \
    $(kubectl get pod -l app=vault-injector-test -o jsonpath="{.items[0].metadata.name}") \
    --container vault-injector-test -- cat /vault/secrets/test
    ```
