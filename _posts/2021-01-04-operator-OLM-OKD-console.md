---
layout: post
title: 쿠버네티스 OLM과 OKD-console로 Operator 관리하기
categories: [Kubernetes]
tags: [Kubernetes]
comments: true
---

- [오퍼레이터(Operator)](#오퍼레이터operator)
  - [오퍼레이터란](#오퍼레이터란)
  - [사용이유](#사용이유)
  - [오퍼레이터 검색법](#오퍼레이터-검색법)
- [실습](#실습)
  - [OLM](#olm)
    - [설치](#설치)
    - [검증](#검증)
  - [OKD Console](#okd-console)
    - [디플로이먼트](#디플로이먼트)
    - [서비스](#서비스)
    - [검증](#검증-1)
  - [(옵션) Istio & cert-manager & dex 설정](#옵션-istio--cert-manager--dex-설정)
    - [Certificate](#certificate)
    - [Gateway](#gateway)
    - [VirtualService](#virtualservice)
  - [ArgoCD operator](#argocd-operator)
    - [설치](#설치-1)
    - [검증](#검증-2)
- [참고 URL](#참고-url)

## 오퍼레이터(Operator)

### 오퍼레이터란

쿠버네티스에서 각 컨트롤러는 컨트롤 루프(무한루프)를 돌면서 오브젝트를 원하는 상태(desired state)와 현재 상태를 비교한다. 만약 둘의 상태가 다르다면 컨트롤러는 원하는 상태가 되기위해 일련의 작업을 진행한다.

예를 들면 디플로이먼트의 레플리카를 1개에서 2개로 변경시키면 디플로이먼트 컨트롤러는 이를 감지하여 레플리카를 2개로 만드려고 노력할 것이다.(리소스 부족등으로 실패할 수 있음)

오퍼레이터는 일반적인 쿠버네티스 리소스를 관리하는 것이 아닌 사용자 정의 리소스(CR)를 사용하여 istio, grafana, argoCD와 같은 어플리케이션과 그 구성요소를 관리한다.

즉 디플로이먼트 컨트롤러는 디플로이먼트를 관리하며  istio-operator는 istio와 그 구성요소, grafana-operator는 grafana와 그 구성요소를 관리한다. 

operatorSDK에서 operator의 레벨을 아래와같이 정의하였다.

1. 자동화된 설치와 설정 관리
2. 마이너버전 업데이트 지원
3. 백업, 복구 등 어플리케이션 라이프사이클 지원
4. 매트릭과, 알러트, 로그, 분석 툴 지원
5. 자동 운영(수평-수직 확장, 이상감지 등)

![operator-level.png](https://lcc3108.github.io/img/2021/01/04/Untitled.png)

### 사용이유

오퍼레이터는 어플리케이션을 오브젝트로 관리할 수 있게 해주는 이점이 있다.

- 오브젝트이므로 쿠버네티스가 자동으로 쉬지않고 관리해준다.
- 사람은 상태를 명시하기만 할뿐 작업은 모두 오퍼레이터가 하기 때문에 사람의 실수가 개입할 여지가 적다.
- 어플리케이션뿐만 아니라 구성파일(설정파일 등)도 오브젝트로 관리 할 수 있어서 백업, 복구, 이식성이 좋다.

### 오퍼레이터 검색법

안타깝게도 모든 어플리케이션에 오퍼레이터가 존재하지 않는다.

오페레이터를 개발하는데는 kubebuilder와 operatorSDK가 있다.

kubebuilder의 경우 배포를 할 수 있는 레포지토리(yum, apt, npm 등)이 없기때문에 보통 직접적으로 해당 어플리케이션의 문서나 깃 레포지토리에 존재한다.

고로 구글링에 어플리케이션명 operator로 검색하게되면 찾을 수 있다.

operatorSDK경우  [operatorhub](https://operatorhub.io/) 라는 레포지토리가 존재하며 레포지토리에서 검색이 가능하다. 또한 Operator Lifecycle Manager를 통해 관리가 가능하다.

오퍼레이터도 여러사람이 만들 수 있으며 개발하는 방식이 여러가지다 보니 여러개의 오퍼레이터가 존재할 수도있다.

모두 검색을 한뒤 자신이 찾는버전에 맞거나 operator level이 적합한 것을 고르면 된다.

## 실습

Argo CD를  오퍼레이터를 이용하여 설치

- Argo CD : Gitops를 위한 툴(추후 포스트에서 사용법 제공)
- Argo CD 오퍼레이터 : Argo CD를 관리해주는 오퍼레이터
- OLM(Operator Lifecycle Manager) : npm, yarn, yum, apt 같은 오퍼레이터 관리 도구 
- OKD Console : OLM관리메뉴가 있는 [오픈쉬프트](https://www.redhat.com/ko/topics/containers/red-hat-openshift-kubernetes) 대시보드
- [istio](https://istio.io/) or ingress or nodePort: 외부와의 연결 담당 여기서는 istio로 설명
- [cert-manager](https://cert-manager.io/) : 인증서 관리



### OLM
Operator Lifecycle Manager는 오브젝트를 통해 선언적 방식으로 오퍼레이터와 종속성 설치, 관리, 업그레이드를 자동화 해준다.
#### 설치

21-01-03기준 최신버전 0.17.0 설치

```bash
$ curl -sL https://github.com/operator-framework/operator-lifecycle-manager/releases/download/v0.17.0/install.sh | bash -s v0.17.0
customresourcedefinition.apiextensions.k8s.io/catalogsources.operators.coreos.com unchanged
customresourcedefinition.apiextensions.k8s.io/clusterserviceversions.operators.coreos.com unchanged
customresourcedefinition.apiextensions.k8s.io/installplans.operators.coreos.com unchanged  
customresourcedefinition.apiextensions.k8s.io/operatorgroups.operators.coreos.com unchanged
customresourcedefinition.apiextensions.k8s.io/operators.operators.coreos.com unchanged     
customresourcedefinition.apiextensions.k8s.io/subscriptions.operators.coreos.com unchanged 
customresourcedefinition.apiextensions.k8s.io/catalogsources.operators.coreos.com condition met
customresourcedefinition.apiextensions.k8s.io/clusterserviceversions.operators.coreos.com condition met
customresourcedefinition.apiextensions.k8s.io/installplans.operators.coreos.com condition met  
customresourcedefinition.apiextensions.k8s.io/operatorgroups.operators.coreos.com condition met
customresourcedefinition.apiextensions.k8s.io/operators.operators.coreos.com condition met
customresourcedefinition.apiextensions.k8s.io/subscriptions.operators.coreos.com condition met
namespace/olm unchanged
namespace/operators unchanged
serviceaccount/olm-operator-serviceaccount unchanged
clusterrole.rbac.authorization.k8s.io/system:controller:operator-lifecycle-manager unchanged
clusterrolebinding.rbac.authorization.k8s.io/olm-operator-binding-olm unchanged
deployment.apps/olm-operator configured
deployment.apps/catalog-operator configured
clusterrole.rbac.authorization.k8s.io/aggregate-olm-edit unchanged
clusterrole.rbac.authorization.k8s.io/aggregate-olm-view unchanged
operatorgroup.operators.coreos.com/global-operators unchanged
operatorgroup.operators.coreos.com/olm-operators unchanged   
clusterserviceversion.operators.coreos.com/packageserver configured
catalogsource.operators.coreos.com/operatorhubio-catalog unchanged
deployment "olm-operator" successfully rolled out
deployment "catalog-operator" successfully rolled out
Package server phase: Succeeded
deployment "packageserver" successfully rolled out
```

#### 검증

```bash
$ kubectl get all -n olm
NAME                                                                  READY   STATUS      RESTARTS   AGE
pod/catalog-operator-598b54c95d-psvlr                                 1/1     Running     11         26h
pod/olm-operator-fb46b989d-wlwdt                                      1/1     Running     11         26h
pod/operatorhubio-catalog-49jcp                                       1/1     Running     10         26h
pod/packageserver-5895694bf9-s9hrs                                    1/1     Running     10         26h
pod/packageserver-5895694bf9-t9lx7                                    1/1     Running     9          26h

NAME                            TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)     AGE
service/operatorhubio-catalog   ClusterIP   10.106.159.79    <none>        50051/TCP   26h
service/packageserver-service   ClusterIP   10.102.224.133   <none>        5443/TCP    74m

NAME                               READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/catalog-operator   1/1     1            1           26h
deployment.apps/olm-operator       1/1     1            1           26h
deployment.apps/packageserver      2/2     2            2           26h
```

### OKD Console

OKD console에서 거의 모든 쿠버네티스 오브젝트를 생성, 삭제, 수정 할 수 있기때문에 dex와 같은 인증을 사용하거나 localhost에서만 사용하는걸 추천한다.

#### 디플로이먼트

https://your-domain.com 올바른 값으로 변경

- NodePort 사용시 : http://localhost:port
- 도메인연결시 : http(s)://FQDN

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: okd-console
  name: okd-console
spec:
  replicas: 1
  selector:
    matchLabels:
      app: okd-console
  template:
    metadata:
      labels:
        app: okd-console
    spec:
      containers:
      - image: quay.io/openshift/origin-console:4.6 # 4.7부터는 에러발생하므로 4.6 사용
        name: origin-console
        resources: {}
        command:
        - ./opt/bridge/bin/bridge
        - "--base-address={https://your-domain.com}" ###### 변경 필요
        - "--public-dir=/opt/bridge/static"
EOF
```

#### 서비스

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  labels:
    app: okd-console
  name: okd-console
  namespace: olm
spec:
  ports:
  - port: 9000
    protocol: TCP
    targetPort: 9000
  selector:
    app: okd-console
  type: ClusterIP
EOF
```

#### 검증

port-foward 설정(위에서 찾은 팟 이름 넣기)

```bash
kubectl port-forward -n olm service/okd-console 9000:9000
```

[http://localhost:9000](http://localhost:9000) 접속시 아래와같은 화면이 뜨면 설치 성공

![OKD-console.png](https://lcc3108.github.io/img/2021/01/04/Untitled%201.png)

### (옵션) Istio & cert-manager & dex 설정

localhost가 아닌 example.com과 같은 FQDN을 가지고있을때 설정

[Istio](https://lcc3108.github.io/articles/2020-12/istio)와 [cert-manager](https://lcc3108.github.io/articles/2020-12/certmanager) 설정법은 블로그 참조

#### Certificate
인증서 생성
```bash
apiVersion: cert-manager.io/v1alpha2
kind: Certificate
metadata:
  name: olm
  namespace: istio-system
spec:
  secretName: olm-tls
  issuerRef:
    name: letsencrypt-prod-istio
    kind: ClusterIssuer
  commonName: example.com
  dnsNames:
  - example.com
```

#### Gateway
게이트웨이 추가 및 인증서 설정
```bash
kind: Gateway
apiVersion: networking.istio.io/v1alpha3
metadata:
  name: olm
  namespace: olm
spec:
  servers:
    - hosts:
        - example.com
      port:
        name: http
        number: 80
        protocol: HTTP
      tls:
        httpsRedirect: true
    - hosts:
        - example.com
      port:
        name: https
        number: 443
        protocol: HTTPS
      tls:
        credentialName: olm-tls
        mode: SIMPLE
  selector:
    istio: ingressgateway
```

#### VirtualService
게이트웨이로 들어온 트래픽 처리
```bash
kind: VirtualService
apiVersion: networking.istio.io/v1alpha3
metadata:
  name: olm
  namespace: olm
spec:
  hosts:
    - example.com
  gateways:
    - olm
  http:
    - route:
        - destination:
            host: okd-console.olm.svc.cluster.local
```

### ArgoCD operator 
ArgoCD는 Gitops의 구현체이다.

현재 포스트에서는 오퍼레이터를 통해 ArgoCD라는걸 몰라도 간단히 설치를 할 수 있음을 확인할 수 있다.
#### 설치

좌측 Administration → Namespaces메뉴에서 Create Namespace로 argocd 생성

Operators → OperatorHub 메뉴에서 검색창에 argocd 검색후 Argo CD 클릭

![argo-cd.png](https://lcc3108.github.io/img/2021/01/04/Untitled%202.png)

argocd 네임스페이스 선택 후 Install 클릭

![argo-config.png](https://lcc3108.github.io/img/2021/01/04/Untitled%203.png)

잠시뒤 오퍼레이터 설치 완료 후 View Operator 혹은 Installed Operators에서 Argo CD 클릭하면 위와같은 화면이 뜬다.

![argo-config2.png](https://lcc3108.github.io/img/2021/01/04/Untitled%204.png)

여기서 ACD ArgoCD의 Create Instance 클릭

![argo-config3.png](https://lcc3108.github.io/img/2021/01/04/Untitled%205.png)


맨아래 Advanced Configuration을 클릭후 Anonymous Users Enabled 활성화(추후 검증시 들어가보기 위함)

![argo-config4.png](https://lcc3108.github.io/img/2021/01/04/Untitled%206.png)

잠시 시간이 지나면 설치가 완료된다.

#### 검증

명령어를 통해 Argo CD가 설치된 모습을 확인 할 수 있다.

```bash
$ kubectl get all -n argocd                                                                                           5495ms | docker-desktop | olm  
NAME                                                 READY   STATUS    RESTARTS   AGE
pod/example-argocd-application-controller-774cc495f6-tzcrx   1/1     Running   0          94s
pod/example-argocd-dex-server-79bdcfdf45-wgqqw               1/1     Running   0          94s  
pod/example-argocd-operator-d7b598dd5-cd2vh                  1/1     Running   0          4m44s
pod/example-argocd-redis-6f7cfddbcb-rbhhm                    1/1     Running   0          94s  
pod/example-argocd-repo-server-5454d6c459-9zzr9              1/1     Running   0          94s  
pod/example-argocd-server-5d998f7668-92psl                   1/1     Running   0          94s  

NAME                              TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)             AGE
service/example-argocd-dex-server         ClusterIP   10.102.145.62   <none>        5556/TCP,5557/TCP   94s
service/example-argocd-metrics            ClusterIP   10.107.48.251   <none>        8082/TCP            94s
service/example-argocd-operator-metrics   ClusterIP   10.99.176.22    <none>        8383/TCP,8686/TCP   4m33s
service/example-argocd-redis              ClusterIP   10.96.172.237   <none>        6379/TCP            94s
...생략
```

port-forwarding으로 확인

```bash
kubectl port-forward -n argocd service/example-argocd-server 9000:443
```

아래와 같이 페이지가 뜨면 설치가 완료된 것이다.

![argo-installed.png](https://lcc3108.github.io/img/2021/01/04/Untitled%207.png)


---

## 참고 URL

- [https://www.redhat.com/ko/topics/containers/what-is-a-kubernetes-operator](https://www.redhat.com/ko/topics/containers/what-is-a-kubernetes-operator)
- [https://sdk.operatorframework.io/docs/overview/](https://sdk.operatorframework.io/docs/overview/)
- [https://argocd-operator.readthedocs.io/en/latest/](https://argocd-operator.readthedocs.io/en/latest/)