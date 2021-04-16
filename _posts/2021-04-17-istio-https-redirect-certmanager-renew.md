---
layout: post
title: istio https redirect 설정 상태에서 certmanager 인증서 발급법
categories: [Istio]
tags: [Istio, cert-manager]
comments: true
---


- [개요](#개요)
- [문제상황](#문제상황)
- [해결방법](#해결방법)

## 개요

Istio와 Cert Manager를 통해 웹 서비스를 운영하면 손쉽게 https 인증서를 발급 및 적용시킬 수 있다.

Istio를 사용하여 http로 접속하는 클라이언트를 https로도 손쉽게 리다이렉션 할 수 있다.

그러나 Cert Manager의 인증서 발급/갱신 요청도 https로 보내면 인증서 발급에 실패하게된다.

## 문제상황

Cert Manager는 Let's encrypt를 사용하여 인증서를 발급 받을 수 있다.

"lcc3108.example.com"의 인증서를 발급 받고싶다면 http://lcc3108.example.com/.well-known/acme-challenge/\<TOKEN\> 이런형식의 주소에 http 리퀘스트를 보내 확인한다.

인증방식에 대한 자세한 내용은 [let's encrypt docs](https://letsencrypt.org/ko/docs/challenge-types/#http-01-%EC%B1%8C%EB%A6%B0%EC%A7%80)에 나와있다.

Cert Manager는 위의 http://lcc3108.example.com/.well-known/acme-challenge/\<TOKEN\> 주소로 요청이 오게되면 자신이 만든 pod으로 요청을 전송하는 Ingress 규칙을 만든다.

그러나 Istio Gateway에 의해 http to https가 먼저 수행되서 https로 요청을 하게된다.

그 결과 http에 걸려있는 인그레스는 동작을 하지않게 되며 인증확인을 위한 http 주소로 리퀘스트를 날리지만 404 에러가 뜨게된다.

그래서 필자는 인증서 갱신의 자동화를 위해 [operator sdk](https://github.com/operator-framework/operator-sdk)를 사용하여 인증서관련된 ingress 생성시 istio gateway의 http to https redirection을 자동으로 제거 및 생성시켜주는 operator를 만들까 고민했었다.

다만 해당 방법은 갱신하는 순간에 http 트래픽을 받으며 아래의 방법이 더 좋기떄문에 해당방법을 적용했다

## 해결방법

만들기전에 구글링을 하던중 [해결 방법](https://github.com/jetstack/cert-manager/issues/1636#issuecomment-721490874)을 발견하게 되었다.

해결방법에 따르면 아래와같이 설정하면 된다.

1. 특정 호스트를 가진 http Istio Gateway를 제거한다.
2. 대신 * (모든호스트)로 와일드카드로 http to https 리다이렉션을 가진 Gateway를 추가한다.

``` yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: http-general-gateway
  namespace: istio-system
  labels:
    app: ingressgateway
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 80
        protocol: HTTP
        name: http
      hosts:
        - "*"
      tls:
        httpsRedirect: true
```

트래픽 라우팅의 우선순위가 아래와 같다.

1. 특정 호스트가 지정된 Gateway
2. 특정 호스트가 지정된 Ingress
3. 모든 호스트를 지정한 Gateway

고로 2번에 Ingress가 우선순위가 위에 있어 인증을 받을 수 있으며 *(wildcard) 게이트웨이로 http to https 리다이렉션도 잘 동작하게된다.

Cert Manager 레포에도 해당 이슈가 오픈되어져 있으며 [PR](https://github.com/jetstack/cert-manager/pull/3011)도 생성되어있다.

해당 PR이 머지된뒤 새로운 릴리즈가 나올때까지는 매우 유용한 방법이다.

