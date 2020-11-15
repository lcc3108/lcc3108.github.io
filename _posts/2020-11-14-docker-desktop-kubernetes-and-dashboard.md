---
layout: post
title: Docker Desktop으로 Kubernetes PlayGround 만들기
categories: [Kubernetes]
tags: [Kubernetes]
comments: true
---


### 들어가기 전

쿠버네티스에서 뭔가를 실행 시켜보고 싶을때 즉 playground가 필요할때 gcp의 3개월 무료크레딧을 사용하고 있는 GKE를 사용하고 있었다.

그러다가 udemy Istio강의를 보면서 minikube를 설치하려다가 설치를 위해 Docker Desktop에 설정하는곳에 쿠버네티스가 떡하니 있어서 설치를 해보았다.

윈도우를 기준으로 설치과정을 설명해보자 한다.(사실 엄청 간단하다)

### 필수 요구사항

- OS : Windows 10 version 2004, Build 19041 이상(WSL2를 활성화하는 요구사항)
- [WSL2 활성화](https://docs.microsoft.com/ko-kr/windows/wsl/install-win10) 및 리눅스 설치([우분투 링크](https://www.microsoft.com/ko-kr/p/ubuntu/9nblggh4msv6?activetab=pivot:overviewtab))
- [도커 데스크톱 설치](https://www.docker.com/products/docker-desktop)

### 설치과정

윈도우 버전, WSL2 활성화 도커데스크톱이 설치되었다고 가정한다.

1. docker desktop 실행(윈도우에서 검색이나 우측하단 트레이에서 실행) 및 톱니바퀴 클릭

    ![https://lcc3108.github.io/img/2020-11/14/Untitled.png](https://lcc3108.github.io/img/2020-11/14/Untitled.png)

2. 쿠버네티스 항목에 들어가 Enable Kubernetes 선택후 Apply & Restart를 클릭해준다.

    ![https://lcc3108.github.io/img/2020-11/14/Untitled%201.png](https://lcc3108.github.io/img/2020-11/14/Untitled%201.png)

필자의 경우 설치 시작을 하지않길래 트레이 아이콘에서 도커데스톱 재시작을 하였다.

잠시동안의 시간이 흐르면 설치가 끝난다. cmd나 wsl안에서 모두 kubectl 명령어가 사용가능하다.

Reset Kubernetes를 사용하여 초기화 할 수 있다.

### 설치 검증
#### 대시보드 설치

잘동작하는지 확인해보기 위해 쿠버네티스 대시보드를 설치해보자.

[쿠버네티스 대시보드 github](https://github.com/kubernetes/dashboard) 페이지를 참고해서 진행하였다.

윈도우에서 wsl이라고 치면 리눅스 쉘을 실행시킬 수 있다 해당 쉘에서 작업을 진행하였다.

쉘에 아래 명령어를 입력해보자

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.4/aio/deploy/recommended.yaml
```

출력으로 여러가지 오브젝트들이 만들어진걸 알 수 있다.

![https://lcc3108.github.io/img/2020-11/14/Untitled%202.png](https://lcc3108.github.io/img/2020-11/14/Untitled%202.png)

대시보드에 모든 팟들이 Running 상태가 되면 아래의 명령어를 실행시킨다.

명령어 실행중에는 다른명령어를 처리 할 수 없으니 background로 실행시키거나 다른 쉘을 사용하면된다.

```bash
#다른쉘 사용할경우
kubectl proxy
#백그라운드 실행
kubectl proxy&
```

프록시 명령어가 동작중에 8081번 포트로 접근하게되면 쿠버네티스 클러스터에 접근 할 수 있다.

[대시보드 URL](http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/) 접속하면 아래와같이 인증이 필요하다고 뜬다.

![https://lcc3108.github.io/img/2020-11/14/Untitled%203.png](https://lcc3108.github.io/img/2020-11/14/Untitled%203.png)


#### 사용자 생성
토큰을 얻기위해 [쿠버네티스 대시보드 문서](https://github.com/kubernetes/dashboard/blob/master/docs/user/access-control/creating-sample-user.md)의 과정을 따라가 봤다.

1. Service Account 생성

    ```bash
    cat <<EOF | kubectl apply -f -
    apiVersion: v1
    kind: ServiceAccount
    metadata:
      name: admin-user
      namespace: kubernetes-dashboard
    EOF
    ```

2. ClusterRoleBinding
    - Role은 위의 kubectl apply -f 명령어를 통해 만들어졌다.
    - 해당 Role에 방금 만든 Service Account를 매핑 시켜주면 권한을 얻을 수 있다.

        ```bash
        cat <<EOF | kubectl apply -f -
        apiVersion: rbac.authorization.k8s.io/v1
        kind: ClusterRoleBinding
        metadata:
          name: admin-user
        roleRef:
          apiGroup: rbac.authorization.k8s.io
          kind: ClusterRole
          name: cluster-admin
        subjects:
        - kind: ServiceAccount
          name: admin-user
          namespace: kubernetes-dashboard
        EOF
        ```

3. 생성된 토큰 얻기
링크에서는 describe를 사용하지만 get과 jsonpath를 사용하여 토큰만 뽑아냈다.
공백을 복사하지 않았는지 잘 확인하자

    ```bash
    kubectl -n kubernetes-dashboard get secret $(kubectl -n kubernetes-dashboard get secret | grep admin-user | awk '{print $1}') -o jsonpath='{.data.token}' | echo `base64 -d`
    ```

3번의 결과물로 출력된 토큰을 입력하여 로그인을 하게되면 대시보드 화면이 뜬다.

![https://lcc3108.github.io/img/2020-11/14/Untitled%204.png](https://lcc3108.github.io/img/2020-11/14/Untitled%204.png)

대시보드의 여러가지 메뉴가 있으니 자유롭게 둘러보면 된다.

---
2020-11-15일 수정
쿠버네티스 대시보드는 [44bits 도커데스크톱 쿠버네티스 글](https://www.44bits.io/ko/post/news--release-docker-desktop-with-kubernetes-to-stable-channel)을 참고하면서 진행하였으며 인증부분에 대한 내용이 없어 kubernetes-dashboard 깃허브를 참고하며 추가하였다.

