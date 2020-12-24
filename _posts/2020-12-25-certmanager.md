---
layout: post
title: Istio cert-manager 연동
categories: [Istio]
tags: [Istio, cert-manager]
comments: true
---

- [설치](#설치)
- [검증](#검증)
- [테스트](#테스트)
  - [사전준비](#사전준비)
  - [Nginx 생성](#nginx-생성)
  - [인증서 발급](#인증서-발급)
  - [Istio Gateway, VirtualService 생성](#istio-gateway-virtualservice-생성)
  - [검증](#검증-1)



전세계의 수많은 웹사이트가 있다. 

그중에는 http 평문통신하는 하는 사이트와 https 암호화 통신을 하는 사이트가 있다. 

[구글 통계](https://transparencyreport.google.com/https/overview)에 따르면 window 환경에서 2015년에는 웹사이트의 40%만 https를 사용하였으나 최근에는(2020-12) 90% 정도 사용하고있다.

당신이라면 어떤 사이트를 이용하겠는가? 당연히 https일 것이다.

https로 서비스하기 위해선 인증서가 필요하다. 

과거에는 비용을 지불하여 인증서를 발급 받을 수 있었지만 현재는 [Let's Encrypt - 무료 SSL/TLS 인증서](https://letsencrypt.org/ko/)를 사용하여 무료로 발급받을 수 있다.

letsencrypt로 발급 받게되면 3달동안 유효한 인증서를 받게되며 certbot-auto를 통해 자동으로 갱신이 가능하다.

url(wildcard 사용가능), 서버 당 직접 설정을 해줘야한다.

쿠버네티스 인그레스나 istio를 사용시 수많은 url과 subdomain이 생길것이다.

이를 사람이 개별적으로 발급받고 하는 절차를 할 수 있지만 매우 비효율적일 것이다.

인증서를 프로비저닝해주고 자동으로 관리해주는 도구가 cert-manager이다.


## 설치

쿠버네티스에 cert-manager를 설치해보자.

```bash
#install cert-manager
$ kubectl apply -f https://github.com/jetstack/cert-manager/releases/download/v1.1.0/cert-manager.yaml
#add issuer prod & staging
$ kubectl apply -f - <<EOF
#prod
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod-istio
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: example@example.com #change your email
    privateKeySecretRef:
      name: letsencrypt-prod-istio
    solvers:
    - http01:
        ingress:
          class: istio
---
#staging
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging-istio
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: example@example.com #change your email
    privateKeySecretRef:
      name: letsencrypt-staging-istio
    solvers:
    - http01:
        ingress:
          class: istio
EOF
```

위의 스크립트 입력시 cert-manager 설치와 staging(테스트용) ClusterIssuer(발급자), prod(실제) ClusterIssuer가 생성된다.

자동적으로 privateKeySecretRef에 이름과 같은 Secret이 자동으로 생성된다.

## 검증

```bash
#pod 3개가 존재하며 모두 Running인지 확인
$ kubectl get svc,pod -n cert-manager
NAME                           TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
service/cert-manager           ClusterIP   10.107.76.142   <none>        9402/TCP   147m
service/cert-manager-webhook   ClusterIP   10.105.58.158   <none>        443/TCP    147m

NAME                                          READY   STATUS    RESTARTS   AGE
pod/cert-manager-5597cff495-t6tsk             1/1     Running   0          147m
pod/cert-manager-cainjector-bd5f9c764-r6stl   1/1     Running   0          147m
pod/cert-manager-webhook-5f57f59fbc-zfcl2     1/1     Running   0          147m

#letsencrypt-prod-istio, letsencrypt-staging-istio 존재 확인
$ kubectl get secret -n cert-manager 
NAME                                  TYPE                                  DATA   AGE
cert-manager-cainjector-token-jrmsd   kubernetes.io/service-account-token   3      145m
cert-manager-token-mwzz4              kubernetes.io/service-account-token   3      145m
cert-manager-webhook-ca               Opaque                                3      145m
cert-manager-webhook-token-5d4qc      kubernetes.io/service-account-token   3      145m
default-token-gqh48                   kubernetes.io/service-account-token   3      145m
letsencrypt-prod-istio                Opaque                                1      106m
letsencrypt-staging-istio             Opaque                                1      106m

#Ready True인지 확인
$ kubectl get clusterissuers.cert-manager.io
NAME                        READY   AGE
letsencrypt-prod-istio      True    107m
letsencrypt-staging-istio   True    107m
```

## 테스트
certmanager를 설치하였으니 nginx pod을 배포하여 테스트 해보자

### 사전준비
인증서 발급을 받기위해선 Domain주소가 필수적이다.

여기서는 your-site.com를 예시로 들어서 사용하였다.

실습을 위해서는 your-site.com을 변경하여서 자신의 도메인으로 변경하여 사용해야한다.

- Domain : freenom에서 무료도메인 발급가능 & cloudflare를 통해 도메인 관리 가능
- istio : [istio 설치법](https://lcc3108.github.io/articles/2020-12/istio#istio-%EC%84%A4%EC%B9%98)



cloudflare를 통해 subdomain인 web.your-site.com, test.your-site.com 등 *.your-site.com 등록이 가능하다.

### Nginx 생성

```yaml
#nginx deploy 생성
$ kubectl create deployment --image nginx --port 80 nginx
#nginx service 생성
$ kubectl expose deployment nginx --port 80
```

### 인증서 발급

istio에 인증서를 적용시키기 위해서는 istio-ingressgateway가 있는 namepsace에 인증서를 발급받아야한다.

```bash
$ kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1alpha2
kind: Certificate
metadata:
  name: nginx
  namespace: istio-system # istio 설치경로
spec:
  secretName: nginx-tls
  issuerRef:
    name: letsencrypt-prod-istio
    kind: ClusterIssuer
  commonName: your-site.com
  dnsNames:
  - your-site.com
EOF
```

위의 명령어 실행후 아래 명령어를 통해 상태를 확인 할 수 있다.

```bash
$ kubectl get certificate
NAMESPACE      NAME    READY   SECRET      AGE
default       nginx   True    nginx-tls   62m
```

보통 인증서는 수분내(1~2분내외)로 생성이 된다.

인증서 발급시 certificate → certificaterequest -> orders ->  challenges 순으로 절차가 오브젝트가 생성된다.

만약 시간이 오래걸린다면 kubectl describe로 certificaterequests.cert-manager.io, orders.acme.cert-manager.io, challenges.acme.cert-manager.io 오브젝트 들의 상태를 확인하여한다.

트러블 슈팅문서를 참고하면 좋다.

- [Troubleshooting](https://cert-manager.io/docs/faq/troubleshooting/)

- [Troubleshooting Issuing ACME Certificates](https://cert-manager.io/docs/faq/acme/)

### Istio Gateway, VirtualService 생성

```bash
$ kubectl apply -f - <<EOF
#Gateway
kind: Gateway
apiVersion: networking.istio.io/v1alpha3
metadata:
  name: nginx
spec:
  servers:
    - hosts:
        - your-site.com
      port:
        name: http
        number: 80
        protocol: HTTP
      tls:
        httpsRedirect: true # 인증서 발급전 테스트를 원한다면 옵션제거가능
    - hosts:
        - your-site.com
      port:
        name: https
        number: 443
        protocol: HTTPS
      tls:
        credentialName: nginx-tls
        mode: SIMPLE
  selector:
    app: istio-ingressgateway
---
#VirtualService
kind: VirtualService
apiVersion: networking.istio.io/v1alpha3
metadata:
  name: nginx
spec:
  hosts:
    - your-site.com
  http:
    - route:
        - destination:
            host: nginx#.{service-namespace}.svc.cluster.local
  gateways:
  - nginx
EOF
```

### 검증

브라우저를 통해 your-site.com을 들어가보자.

자물쇠 마크와 함께 적용된 인증서를 확인할 수있다. 

![cert.png](https://lcc3108.github.io/img/2020-12/24/cert.png)

---

참고 URL
- https://cert-manager.io/docs/
- https://istio.io/latest/docs/ops/integrations/certmanager/
- https://transparencyreport.google.com/https/overview