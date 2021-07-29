---
layout: post
title: 쿠버네티스 환경에서 Vault 활용하기 1편(설치)
categories: [Vault]
tags: [Vault]
comments: true
---

- [개요](#개요)
- [Vault](#vault)
  - [설명](#설명)
  - [상태](#상태)
  - [초기화](#초기화)
  - [설치](#설치)

## 개요

개인프로젝트에서 ArgoCD를 사용하여 배포하고있다.

이때 github에 올라간 Helm 차트 내부에는 Access Key, Secret Key, 비밀번호 등이 상수 값으로 존재하게된다.

민감데이터를 레포지토리에 상수값으로 넣어두는 것은 보안상으로 좋지않다.

그 레포지토리가 private라고해도 접근제어가 잘못되었다거나 사용하는 서비스의 장애 등 여러 요인으로 탈취 당할 수 있다.

[Vault](https://www.vaultproject.io/)는 이러한 민감데이터를 관리해주는 도구이다.

Vault를 통해 민감데이터를 관리하지만 주입받는 방법은 아래 3가지 정도가 있다.


1. Hashicorp vault injector의 muatating webhook을 사용해 주입
2. Argocd vault plugin을 사용해서 Argocd 동기화 직전에 주입
3. Banzai cloud의 bank vault mutating webhook을 사용해 주입

1번 방법은 Argocd 없이도 사용이가능하며 Vault만 있으면 된다.

2번 방법은 Argocd를 사용한다는 가정하에서만 사용이 가능하다.

3번 방법은 Vault를 사용하기쉽게 래핑한 Bank vault를 사용하게 된다.(내부적으론 Hashicorp vault 사용)

Vault 활용하기 포스트에서 3가지 모두 다뤄보도록 하겠다.

3번 방법은 Hashicrop vault의 래퍼인 Bank vault가 필요하므로 별도의 설치법을 포스팅 할 예정이며 1, 2번 방법을 위한 Vault설치부터 진행해보자.

## Vault

### 설명

다양한 플랫폼에서 Vault라는 서비스가 있지만 여기서 Vault는 테라폼으로도 유명한 HashCorp의 Vault를 의미한다.

Vault는 시크릿이나 민감한 데이터를 저장 및 관리하는 도구이다.

여기서의 민감한 데이터는  개발 및 운영 환경에서의 DB 암호, DB 주소, SSH Key, AWS Key와 같은 Key/Value 데이터와 database 접속관리, AWS IAM과 같은 자격증명까지도 관리해준다.

Vault를 사용하면 UI, CLI, HTTP API를 제공하여 민감 데이터를 다룰 수 있다.

### 상태
Vault는 seal과 unseal의 상태를 가지며 seal상태는 잠긴상태로 unseal되기전까지 Vault의 기능을 사용할 수 없다.

unseal시에는 Vault의 모든 기능을 사용할 수 있다.

seal -> unseal시에는 Vault의 잠금해제 키들중에 초기화시 지정한 개수의 키를 입력해야한다.

ex) 초기화 단계에서 키를 5개생성 및 unseal시 필요한 키의 개수를 3개로 지정하면 추후 unseal시 5개중 3개의 키를사용하면 unseal 가능

### 초기화

Vault를 설치후 처음 가동하기 위해서는 초기화가 필요하다.

초기화는 Vault에서 사용할 키의 개수(key-share)와 Vault를 unseal할때 필요한 키의 개수(key-threshold)의 개수를 정한다.

key-threshold(key-share >= key-threshold)의 개수를 처음 초기화시 cli나 gui에서 정할수 있다.

ex) 아래 명령어 사용시 키는 3개가 생성되며 3개중 2개를 사용하면 Vault를 unseal할 수 있다.
```bash
vault operator init -key-shares=3 -key-threshold=2 
```

### 설치

쿠버네티스 환경에서 어플리케이션을 설치하는 방법은 크게 2가지가 있다.
- 어플리케이션을 직접 혹은 Helm차트로 설치
- 어플리케이션을 설치 및 관리해주는 Operator를 통해 설치

이 글에서는 Helm을 통한 설치를 다룬다.

[Vault 레포지토리](https://github.com/hashicorp/vault-helm)를 통해 설치해보자

요구 사항은 아래와 같다
- Kubernetes 1.4+
- Helm 3

1.  헬름 차트 설치
    ```bash
    helm repo add hashicorp https://helm.releases.hashicorp.com
    helm repo update 
    kubectl create ns vault
    ```
    1. 초기화, 설정없이 테스트용 설치(메모리에 저장함으로 재시작시 데이터가 날아감)
        
        아래 방법으로 설치시 초기화 및 unseal을 진행할 필요가 없으며 로그인을 위한 Root token 값은 `root`이다.
        ```bash
        helm upgrade --install vault hashicorp/vault -n vault \
        --set server.dev.enabled=true \
        --set server.dataStorage.enabled=false
        ```
    2. hostpath 사용
        ```bash
        helm install vault hashicorp/vault -n vault
        ```
    3. 위의 경우를 제외한 나머지 경우
        ```bash
        helm install vault hashicorp/vault -n vault \
        --set server.dataStorage.storageClass={YOUR_STORAGE_CLASS}
        ``` 
2.  초기화
    
    Vault 설치 후 처음 실행시 초기화 과정이 필요하다.

    아래 명령어를 사용해 나오는 `Unseal key`와 로그인에 사용되는 `Root Token`을 잘 저장해두자.
    ```bash
    $ kubectl config set-context --current --namespace=vault
    $ kubectl exec -it vault-0 -- /bin/sh 
    #기본값 key-share=5 key-threshold=3
    $ vault operator init
    Unseal Key 1: q7hVrE9DLGZTTUwI248ep/Yv1551w/3NkANAtfyGSTm7
    Unseal Key 2: i/mtNO0j6ACYNw8BtD4MAlHuOef4w0kkxhQFsSUS22iy
    Unseal Key 3: gsGhzx09Sc6vdVzvraDTEk4nCEYUmGhJHRy5dbYuIm3k
    Unseal Key 4: JJfoCquehit/FjrPz0/x8usFIckD38McNT6r03Jw3ZUI
    Unseal Key 5: 7QEK7gBGAfoJx+lk18jY1eW+TzruyKL7Eq8KFkOOAzpB
    #Vault login시 필요한 인증토큰
    Initial Root Token: s.1n5HUMIrUz3w3qHxF2ZEquS4
    ```

3.  unseal
    
    위의 키값들을 사용해 Vault를 unseal 할 수 있다.

    아래 예시처럼 `vault operator unseal`후 키값을 입력해주는 행위를 3번 반복하면 unsel에 성공한다.
    ```bash
    $ vault operator unseal
    Unseal Key (will be hidden): {INPUT_YOUR_KEY_LIKE_BELOW}
    #Unseal Key (will be hidden): q7hVrE9DLGZTTUwI248ep/Yv1551w/3NkANAtfyGSTm7
    Key                Value
    ---                -----
    Seal Type          shamir
    Initialized        true
    Sealed             true
    Total Shares       5
    Threshold          3
    Unseal Progress    1/3
    Unseal Nonce       46f96878-394a-b106-1d80-9f540324b70c
    Version            1.8.0
    Storage Type       file
    HA Enabled         false
    ```
4.  검증

    vault status 명령어의 출력에 Sealed가 false가 되었음을 확인 할 수 있다.
    ```bash
    $ vault status
    Key             Value
    ---             -----
    Seal Type       shamir
    Initialized     true
    Sealed          false
    Total Shares    5
    Threshold       3
    Version         1.8.0
    Storage Type    file
    Cluster Name    vault-cluster-c0bdf919
    Cluster ID      619616e9-cb3b-ac9d-0619-1952f79f1b2c
    HA Enabled      false
    ```

5.  Web ui 접속(옵션)
    
    아래 명령어 입력후 브라우저에서 localhost:8200 접속한다.
    
    로그인시 `2.초기화`단계의 Initial Root Token 입력 혹은 1-1 방법을 사용했을경우 `root` 입력후 로그인 가능하다. 
    ```bash
    kubectl port-forward service/vault 8200:8200
    ```
