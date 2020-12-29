---
layout: post
title: 쿠버네티스에서 컨피그맵, 시크릿 변경시 디플로이먼트 자동 롤아웃(Kubernetes auto restart Pod when ConfigMaps and Secret Change)
categories: [Kubernetes]
tags: [Kubernetes]
comments: true
---

- [예시](#예시)
  - [환경설정](#환경설정)
  - [이미지 변경 시](#이미지-변경-시)
- [리로더(Reloader)](#리로더reloader)
  - [요구사항](#요구사항)
  - [환경설정](#환경설정-1)
  - [설치](#설치)
  - [검증](#검증)
  - [사용법](#사용법)
  - [예시](#예시-1)
    - [배포](#배포)
    - [컨피그맵 변경 테스트](#컨피그맵-변경-테스트)

쿠버네티스에서 컨트롤러는 클러스터의 상태를 관찰 한 다음, 필요한 경우에 생성 또는 변경을 요청하는 컨트롤 루프이다. 각 컨트롤러는 현재 클러스터 상태를 의도한 상태로 유지시키려고 노력한다.

디플로이먼트(Deployment) 또한 디플로이먼트 컨트롤러가 루프를 돌면서 명시된 상태를 유지한다.

## 예시

### 환경설정

kubectl autocomplete & kubectl alias k

```bash
source <(kubectl completion bash) # setup autocomplete in bash into the current shell, bash-completion package should be installed first.
echo "source <(kubectl completion bash)" >> ~/.bashrc # add autocomplete permanently to your bash shell.
alias k=kubectl
complete -F __start_kubectl k
```

### 이미지 변경 시

아래명령어를 통해 sync-nginx라는 디플로이먼트에 이미지를 nginx:1.18로 생성해주자

```bash
$ k create deployment my-nginx --image=nginx:1.18
deployment.apps/my-nginx created
$ k get pod,rs,deployment
NAME                           READY   STATUS    RESTARTS   AGE
pod/my-nginx-dd78ddf67-qmhg6   1/1     Running   0          10m

NAME                                 DESIRED   CURRENT   READY   AGE
replicaset.apps/my-nginx-dd78ddf67   1         1         1       10m

NAME                       READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/my-nginx   1/1     1            1           10m

$ k describe pod | grep image
  Normal  Pulling    10m   kubelet            Pulling image "nginx:1.18"
  Normal  Pulled     10m   kubelet            Successfully pulled image "nginx:1.18" in 2.1321321s
```

그뒤 nginx:1.19로 변경시켜보자

```bash
$ k set image deployment/my-nginx nginx=nginx:1.19
deployment.apps/my-nginx image updated
$ k get pod,rs,deployment
NAME                            READY   STATUS    RESTARTS   AGE
pod/my-nginx-655998ff6d-5pqqw   1/1     Running   0          42s

NAME                                  DESIRED   CURRENT   READY   AGE
replicaset.apps/my-nginx-655998ff6d   1         1         1       42s
replicaset.apps/my-nginx-dd78ddf67    0         0         0       14m

NAME                       READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/my-nginx   1/1     1            1           14m

$ k describe pod | grep image
  Normal  Pulling    12m   kubelet            Pulling image "nginx:1.19"
  Normal  Pulled     12m   kubelet            Successfully pulled image "nginx:1.19" in 2.8686335s
```

위와같이 새로운 ReplicaSet이 생기면서 pod 새로 생성되었다.

## 리로더(Reloader)

디플로이먼트에서 시크릿이나 컨피그맵을 참고하고 있는 경우가 있다.

이때 디플로이먼트에 변경없이 시크릿이나 컨피그맵의 값을 변경시킬 경우 대부분의 디플로이먼트는 pod을 재시작해야 변경내용이 적용된다.(주로 프로세스가 파일을 한번 읽고 메모리에 적재하기 때문)

이러한 문제를 [Stacker/Reloader](https://github.com/stakater/Reloaderhttps://github.com/stakater/Reloader)를(이하 리로더) 사용하여 해결할 수 있다.

리로더는 Stacker에서 만든 오픈소스로 커스텀 컨트롤러역할을 하며 컨피그맵, 시크릿 값변경시 디플로이먼트를 롤링업데이트 시켜준다.

### 요구사항

- kubernetes ≥ 1.19은 조치없이 바로 사용가능

### 환경설정

kubectl autocomplete & kubectl alias k

```bash
source <(kubectl completion bash) # setup autocomplete in bash into the current shell, bash-completion package should be installed first.
echo "source <(kubectl completion bash)" >> ~/.bashrc # add autocomplete permanently to your bash shell.
alias k=kubectl
complete -F __start_kubectl k
```

### 설치

```bash
k apply -k https://github.com/stakater/Reloader/deployments/kubernetes
```

### 검증

```bash
$ k get pod
NAME                                READY   STATUS    RESTARTS   AGE
reloader-reloader-6c887d48d-pw4nz   1/1     Running   0          10m
```

Pod Running 중인지 확인

### 사용법

컨피그맵이나 시크릿을 사용하는 디플로이에 .metadata.annotations 에 값 추가

어노테이션 종류 (a | b).example은 a.exaple OR b.example 둘중 한개

- reloader.stakater.com/auto: "true" : 디플로이먼트의 컨피그맵, 시크릿 변경시 자동으로 롤아웃
- reloader.stakater.com/search: "true" : 디플로이먼트의 컨피그맵, 시크릿 중 reloader.stakater.com/match: "true" 어노테이션을 가진 오브젝트 변경시 롤아웃
- (configmap | secret).reloader.stakater.com/reload: "foo-configmap" : 해당 이름을 가진 오브젝트 변경시 롤아웃

### 예시

아래 명령어를 사용하여 ConfigMap을 읽어서 값을 출력하는 두개의 디플로이먼트가 있다.

no-reloader는 리로더의 어노테이션을 사용하지 않고 use-reloader는 어노테이션을 지정해줬다.

이름과 어노테이션을 제외하고는 동일한 디플로이먼트이다.

#### 배포

```bash
k apply -f - <<EOF
---
apiVersion: apps/v1
kind: Deployment
metadata:
  creationTimestamp: null    
  labels:
    app: no-reloder       
  name: no-reloder
spec:
  replicas: 1
  selector:
    matchLabels:
      app: no-reloder    
  strategy: {}
  template:
    metadata:
      creationTimestamp: null
      labels:
        app: no-reloder
    spec:
      containers:
      - command: ["/bin/sh","-c"]
        args: ['cat /var/config.yaml >> /tmp/text.yaml && watch cat /tmp/text.yaml']
        image: busybox
        name: busybox
        resources: {}
        volumeMounts:
        - name: config
          mountPath: /var
      volumes:
        - name: config
          configMap:
            name: config
            items:
              - key: config.yaml
                path: config.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  creationTimestamp: null
  annotations:
    reloader.stakater.com/auto: "true" 
  labels:
    app: use-reloder       
  name: use-reloder
spec:
  replicas: 1
  selector:
    matchLabels:
      app: use-reloder      
  strategy: {}
  template:
    metadata:
      creationTimestamp: null
      labels:
        app: use-reloder
    spec:
      containers:
      - command: ["/bin/sh","-c"]
        args: ['cat /var/config.yaml >> /tmp/text.yaml && watch cat /tmp/text.yaml']
        image: busybox
        name: busybox
        resources: {}
        volumeMounts:
        - name: config
          mountPath: /var
      volumes:
        - name: config
          configMap:
            name: config
            items:
              - key: config.yaml
                path: config.yaml
---
kind: ConfigMap
apiVersion: v1
metadata:
  name: config
data:
  config.yaml: |
    value: A
---
EOF
```

팟의 출력확인(이때 팟의 이름은 노드마다 다름)

```bash
$ k get pod                                                                                                                     275ms | docker-desktop | test  
NAME                           READY   STATUS    RESTARTS   AGE  
no-reloder-8c54d96ff-d9csv     1/1     Running   0          3m40s
use-reloder-55b4545b4c-wvvrz   1/1     Running   0          3m40s
$ k logs use-reloder-55b4545b4c-wvvrz
Every 2.0s: cat /var/config.yaml                            2020-12-29 20:11:33

value: A
$ k logs no-reloder-8c54d96ff-d9csv
Every 2.0s: cat /var/config.yaml                            2020-12-29 20:13:44

value: A
```

위와같이 모두 컨피그맵에 적혀있는 value: A를 출력하고있다.

#### 컨피그맵 변경 테스트

컨피그맵 값 변경

```bash
k apply -f - <<EOF
kind: ConfigMap
apiVersion: v1
metadata:
  name: config
data:
  config.yaml: |
    value: B
EOF
```

팟을 조회하니 use-reloader의 팟이 롤링 업데이트 진행중임을 알 수있다. 잠시 시간이 흐르면 위의 wvvrz팟을 사라지고 d58tq만 남게된다.

```bash
$ k get pod
NAME                           READY   STATUS              RESTARTS   AGE
no-reloder-8c54d96ff-d9csv     1/1     Running             0          16m
use-reloder-55b4545b4c-wvvrz   1/1     Running             0          16m
use-reloder-745b4c6cc-d58tq    0/1     ContainerCreating   0          2s
##수십초뒤
$ k get pod
NAME                          READY   STATUS    RESTARTS   AGE
no-reloder-8c54d96ff-d9csv    1/1     Running   0          20m
use-reloder-745b4c6cc-d58tq   1/1     Running   0          3m15s
```

아까와 같이 출력을 조회해보자

```bash
$ k logs no-reloder-8c54d96ff-d9csv
Every 2.0s: cat /tmp/text.yaml                              2020-12-29 20:53:03

value: A

$ k logs use-reloder-745b4c6cc-d58tq

Every 2.0s: cat /tmp/text.yaml                              2020-12-29 20:54:50

value: B
```

어노테이션을 사용한 디플로이먼트만 값이 변경되었음을 알 수 있다.