---
layout: post
title: Istio telemetry api 분산추적 소개
categories: [Istio]
tags: [Istio, Jaeger]
comments: true
---

- [시작하기전](#시작하기전)
- [개요](#개요)
- [defaultConfig](#defaultconfig)
- [telemetry api](#telemetry-api)
- [결론](#결론)


## 시작하기전
**istio 1.12.0**를 기준으로 작성했습니다.

**[telemetry api](#telemetry-api) 부분을 그대로 적용시 버그때문에 해당기능은 동작하지 않으며 소개를 위해 작성되었습니다.**

**다음포스트에서 추가적인 설정을 통해 버그없이 사용하는 방법을 포스팅 예정입니다.**

버그를 요약하자면 올바르지않는 호스트헤더 때문에 발생합니다.

자세한 내용은 [pr을 참조](https://github.com/istio/istio/pull/36277)해서 확인 할 수 있습니다.

## 개요 

Istio에서 Distribute tracing(이하 분산추적)을 활성하기 위해서는 크게 두가지 옵션이 있다.

- **meshConfig.defaultConfig**를 사용해 전역적인 설정과 **annotation**을 사용한 워크로드별 설정이다.

- **meshConfig.extensionProviders**를 사용한 프로바이더 설정과 **telemetry** custom define resource(이하 cr)을 사용해 전역, 워크로드별 설정이다.



분산추적 툴에는 대표적으로 zipkin과 jaeger가 있는데 여기서는 jaeger를 예시로 사용한다.

zipkin과 jaeger는 **opentracing** 프로젝트를 통해 서로 호환가능한 라이브러리를 사용하기때문에 서로 호환성을 제공한다.

아래에서는 똑같은 설정을 위한 예시를보고 어떠한 점이 다른지 비교해보자.

## defaultConfig

이스티오는 envoy(이하 인보이)라는 고성능 프록시를 사용하여 메시를 컨트롤한다.

이는 사이드카로 국한되지않고 (ingress, egress) gateway도 포함된다.

이때 인보이가 처음 실행될때 사용하는 설정값이 `meshConfig.defaultConfig`이다.

---

jaeger의 collector가 `jaeger-collector.observability.svc.cluster.local`라는 주소를 가지고 zipkin 호환포트인 9411번을 가진다고 가정한 예시이다.

```yaml
--- 
#istio operator example
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
...
  meshConfig:
    enableTracing: true
    defaultConfig:
      tracing:
        zipkin:
          # address: zipkin.istio-system:9411 설정이 없을때 기본값
          address: "jaeger-collector.observability.svc.cluster.local:9411"  
        sampling: 100.0
...
```

기존값을 위 설정대로 수정하면 `jaeger-collector.observability.svc.cluster.local:9411`로 분산 추적 데이터가 전송 될 수도 있고 아닐 수도 있다.

그렇다면 어떠한 경우에 발생하는지 알아보자.

아래 명령어를 통해 인보이의 config_dump를 할 수 있다.
```bash
# defaultConfig 설정전 부터 존재했던 gateway
$ kubectl exec -ti GATEWAY_POD_NAME -- curl localhost:15000/config_dump | jq '.configs[0].bootstrap.node.metadata.PROXY_CONFIG.tracing'
{
  "zipkin": {
    "address": "zipkin.istio-system:9411"
  }
}
# 신규 혹은 재시작된 사이드카(게이트웨이) 
$ kubectl exec -ti SIDECAR_POD_NAME -c istio-proxy -- curl localhost:15000/config_dump | jq '.configs[0].bootstrap.node.metadata.PROXY_CONFIG.tracing'
{
  "zipkin": {
    "address": "jaeger-collector.observability.svc.cluster.local:9411"
  }
}
```

전자의 경우 설정전부터 존재한 리소스이므로 기본값인 `zipkin.istio-system:9411`이 나온다.

후자의 경우 신규 생성 혹은 재시작 됐으므로 `jaeger-collector.observability.svc.cluster.local:9411`이 나온다.


기존에 배포돼있는 사이드카는 생성당시의 default config를 사용한다.

사이드카가 새로 배포되거나 재시작하는 경우 새로운 default config를 사용한다.

고로 해당 설정을 적용시킨 뒤 메쉬의 인보이를 전부 재시작해야 적용시킬 수 있는것이다.

## telemetry api
**[시작하기전](#시작하기전)에서 서술한대로 버그로 인해 설정은 동작하나 기능은 동작하지않습니다.**

telemetry api는 설정값을 동적으로 설정하며 scope, inheritance, override가 일어난다.

telemetry api는 네임스페이스에 종속적인 cr이며 설정의 동작방식은 아래와 같다.
1. 루트네임스페이스의(보통 istio-system) 설정은 모든 네임스페이스에 적용된다.(selector 무시)
2. 루트네임스페이스를 제외한 selector가 없는 설정은 현재 네임스페이스에 적용된다.
3. selector가 있는 설정은 네임스페이스 내에 selector와 맞는 워크로드에만 적용된다.

각 인보이별로 가장 번호가 높은 설정이 적용된다.

ex) 1,2,3 번 모두 해당될 때 3번 설정이 적용, 3번만 있을 경우 3번만 적용 ...

---

default config와 유사하게 telemetry에서도 같은 가정하에 진행해보자

jaeger의 collector가 `jaeger-collector.observability.svc.cluster.local`이라는 주소를 가지고 zipkin 호환포트인 9411번을 가진다고 가정한 예시이다.

```yaml
--- 
#istio operator
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
  meshConfig:
    enableTracing: true
    extensionProviders:
    - name: jaeger
      zipkin:
        port: 9411
        service: jaeger-collector.observability.svc.cluster.local
---
#telemetry mesh default
apiVersion: telemetry.istio.io/v1alpha1
kind: Telemetry
metadata:
  name: mesh-default
  namespace: istio-system
spec:
  tracing:
  - providers:
    - name: jaeger
    randomSamplingPercentage: 100

---
```

telemetry api는 meshConfig.extensionProviders에 프로바이더를 등록하고 telemetry cr에서 해당 프로바이더를 참고하는 식으로 동작한다.

telemetry api는 service에 입력한 값이 istio service registry에 존재하지않아 알 수 없는 값인 경우 등을 제외하고 거의 바로 적용이 된다.(오류시 미적용됨)

설정 검증은 istiod 로그 확인으로 istio 설정상 문제가 없는지 확인하는 과정과 실제 config_dump를 통해 설정적용여부를 확인한다.

```bash
#istiod pod 이름 찾기
$ kubectl get pod
NAME                                    READY   STATUS    RESTARTS   AGE
istio-ingressgateway-5f7bf6b4df-ldx5x   1/1     Running   4          5d20h
istiod-6fb996b56-2b49h                  1/1     Running   4          5d23h

#오류 예시
#오류 내용을 보면 의도적으로 service의 jaeger에서 aeger로 변경된 예시
$ kubectl logs -f istiod-6fb996b56-2b49h --since=10m | grep "Not able to configure requested tracing provider"
2021-11-30T14:32:58.788619Z     warn    Not able to configure requested tracing provider "jaeger": could not find cluster for tracing provider "jaeger": could not find service aeger-collector.observability.svc.cluster.local in Istio service registry

#정상 로그는 빈값
$ kubectl logs -f istiod-6fb996b56-2b49h --since=10m | grep "Not able to configure requested tracing provider"

# config dump(envoy 개수만큼 출력개수가 늘어남)
$ kubectl exec -ti istio-ingressgateway-5f7bf6b4df-ldx5x -- curl localhost:15000/config_dump | grep -A6 -B3 "type.googleapis.com/envoy.config.trace.v3.ZipkinConfig"
               "provider": {
              "name": "jaeger",
              "typed_config": {
               "@type": "type.googleapis.com/envoy.config.trace.v3.ZipkinConfig",
               "collector_cluster": "outbound|9411||jaeger-collector.observability.svc.cluster.local",
               "collector_endpoint": "/api/v2/spans",
               "trace_id_128bit": true,
               "shared_span_context": false,
               "collector_endpoint_version": "HTTP_JSON"
--               
               "provider": {
              "name": "jaeger",
              "typed_config": {
               "@type": "type.googleapis.com/envoy.config.trace.v3.ZipkinConfig",
               "collector_cluster": "outbound|9411||jaeger-collector.observability.svc.cluster.local",
               "collector_endpoint": "/api/v2/spans",
               "trace_id_128bit": true,
               "shared_span_context": false,
               "collector_endpoint_version": "HTTP_JSON"
```

위의 덤프 결과에서 telemetry api는 동적으로 적용된다는 사실을 알 수 있다.

또한 설정을 위해 telemetry라는 cr을 생성하기때문에 구성의 추적이 쉬워진다.

## 결론

defaultConfig 방식은 재적용을 위해 해당 envoy를 재시작 시켜줘야하는 단점이 있으며 설정 확인을 위해서는 meshconfig와 pod annotation을 직접 확인해야한다.

telemetry api 방식은 istio에서 `extensionProviders` 설정과 `telemetry` 모두 동적으로 적용된다.

이스티오문서에서는 [telemetry api방식을 권장](https://istio.io/latest/docs/tasks/observability/distributed-tracing/mesh-and-proxy-config/)하고 있다.

권장하는 이유는 구성추적을 위해라고 적혀있지만 추가적으로 동적으로 구성을 할 수 있는 강점이 크다.

두개의 설정이 공존하는경우 telemetry api가 우선된다.