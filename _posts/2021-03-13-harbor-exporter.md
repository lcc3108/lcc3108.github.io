---
layout: post
title: Harbor Exporter 설정
categories: [Harbor]
tags: [Harbor, Prometheus]
comments: true
---


- [개요](#개요)
- [Harbor Exporter 설치](#harbor-exporter-설치)

# 개요

쿠버네티스 환경에서 Harbor Exporter를 통해 Prometheus로 데이터를 수집하는 방법에대해 기술한다.

Harbor, Prometheus 가 설치되었다고 가정한다.

# Harbor Exporter 설치

[Harbor Exporter 레포지토리](https://github.com/c4po/harbor_exporter)를 참고하여 작성하였다.

아래 파일은 [c4po/harbor_exporter의 harbor-exporter.yaml](https://github.com/c4po/harbor_exporter/blob/master/kubernetes/harbor-exporter.yaml)에 추가로 `6~8번째 줄`에 Prometheus 어노테이션을 추가하였다.

추가적으로 `61번째 줄` `value`에 harbor-core의 서비스 이름을 넣어줘야하고 `73번째 줄`에서 `HARBOR_PASSWORD`의 Secret을 만들어주거나 value로 넣어줘야한다.

마지막줄에 Harbor가 설치된 Namespace를 넣어주면 끝이난다.

``` yaml
---
kind: Service
apiVersion: v1
metadata:
  name: harbor-exporter
  annotations:
    prometheus.io/scrape: 'true'
    prometheus.io/port: '9107'
  labels:
    app: harbor-exporter
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 9107
      protocol: TCP
  selector:
    app: harbor-exporter

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: harbor-exporter
  labels:
    app: harbor-exporter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: harbor-exporter
  strategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: harbor-exporter
    spec:
      serviceAccountName: default
      restartPolicy: Always
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: harbor-exporter
          image: "c4po/harbor-exporter:debug"
          imagePullPolicy: Always
# skip metrics can only provide through command line
          # command:
          # - /bin/harbor_exporter
          # - --skip.metrics
          # - "scans"
          # - --skip.metrics
          # - "quotas"
          env:
##          necessary in case you monitor multiple Harbor instances in your Prometheus
#            - name: HARBOR_INSTANCE
#              value: my_harbor
            - name: HARBOR_URI
##            name of the Service for harbor-core
              value: http://harbor-core.harbor # change prefix to the name of your Helm release
##            optionally use below construction to address the external endpoint of Harbor
#              valueFrom:
#                configMapKeyRef:
#                  name: prefix-harbor-core # change prefix to the name of your Helm release
#                  key: EXT_ENDPOINT
##          uncomment if you want to use caching
#           - name: HARBOR_CACHE_ENABLED
#             value: "true"
#           - name: HARBOR_CACHE_DURATION
#             value: "20s"
            - name: HARBOR_USERNAME
              value: "admin"
            - name: HARBOR_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: harbor-core # change prefix to the name of your Helm release
                  key: HARBOR_ADMIN_PASSWORD
#            - name: HARBOR_PASSWORD
#              value: "YOUR-PASSWORD"

          securityContext:
            capabilities:
              drop:
                - SETPCAP
                - MKNOD
                - AUDIT_WRITE
                - CHOWN
                - NET_RAW
                - DAC_OVERRIDE
                - FOWNER
                - FSETID
                - KILL
                - SETGID
                - SETUID
                - NET_BIND_SERVICE
                - SYS_CHROOT
                - SETFCAP
            readOnlyRootFilesystem: true
          resources:
            limits:
              cpu: 400m
              memory: 256Mi
            requests:
              cpu: 100m
              memory: 64Mi
          ports:
            - containerPort: 9107
              name: http
          livenessProbe:
            httpGet:
              path: /-/healthy
              port: http
            initialDelaySeconds: 5
            timeoutSeconds: 5
            periodSeconds: 5
          readinessProbe:
            httpGet:
              path: /-/ready
              port: http
            initialDelaySeconds: 1
            timeoutSeconds: 5
            periodSeconds: 5

---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: harbor-exporter
  labels:
    release: mgmt
spec:
  endpoints:
  - interval: 10s
    scrapeTimeout: 10s
    honorLabels: true
    port: http
    path: /metrics
    scheme: http
  selector:
    matchLabels:
      app: harbor-exporter
  namespaceSelector:
    matchNames:
    - harbor # change to the namespace where you deployed Harbor
```

Prometheus에서 확인 해보면 아래와같이 지표가 뜰 것이다.

![Prometheus.png](https://lcc3108.github.io/img/2021/03/13/Prometheus.png)

Prometheus의 지표를 통해 Grafana를 사용하여 알럿이나 모니터링이 가능해졌다.