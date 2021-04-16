---
layout: post
title: 그라파나 이미지를 포함한 슬랙 알럿 설정
categories: [Grafana]
tags: [Grafana, Slack]
comments: true
---


- [개요](#개요)
- [슬랙 설정](#슬랙-설정)
  - [앱 생성](#앱-생성)
  - [채널 설정](#채널-설정)
- [그라파나 설정](#그라파나-설정)
  - [그라파나 이미지 렌더러(Grafana Image Renderer)](#그라파나-이미지-렌더러grafana-image-renderer)
- [이미지 렌더러 설치 검증 및 슬랙 채널 추가](#이미지-렌더러-설치-검증-및-슬랙-채널-추가)
- [문제해결](#문제해결)

## 개요

그라파나(Grafana)는 메트릭 데이터 시각화 도구로 수집된 데이터를 시각화하여 보여준다.

또한 자체 알럿(Alert)기능을 사용하여 슬랙(Slack), 이메일, 디스코드 등 다양한 채널에 알림을 보낼 수 있다.

이번 포스트에서는 슬랙에 알림을 보내는데 S3, Google Cloud Storage, Azure Blob Storage와 같은 외부 저장소를 거치지않고 직접 슬랙에 업로드하는 방법을 알아보자.


## 슬랙 설정

### 앱 생성

그라파나에서 쏴주는 웹훅을 처리하기위해선 슬랙 앱이 필요하다.

이미 슬랙 앱이 있는경우 1번의 링크를 통해 들어가 원하는 앱을 클릭해준뒤 3번부터 진행해주면 된다.

1. [Slack App 관리페이지](https://api.slack.com/apps/)에 들어가서 Create New APP을 눌러준다.

2. 아래 사진과 같이 창이 뜨면 원하는 앱 이름과 앱을 어떤 워크스페이스에서 쓸것인지 지정해준다.   
![slack setting.png](https://lcc3108.github.io/img/2021/03/15/slack-app-setting.png)

   1. (옵션) 밑으로 내려서 Display Information에 원하는 앱 아이콘을 넣을 수 있다.  
정사각형의 이미지가 필요하며 512px ~ 2000px 사이의 이미지를 사용해야한다.


4. 좌측 사이드바의 Features탭에 `OAuth & Permissions`를 클릭한다.

5. 그라파나가 슬랙 api를 통해 메시지와 그래프이미지를 전송하기 위해선 `files:write`와 `chat:write`권한이 필요하기때문에 Bot Token Scopes에 아래 사진과 같이 추가해준다.   
![slack add scope](https://lcc3108.github.io/img/2021/03/15/slack-bot-add-scope.png)

6. 상단에 OAuth Tokens & Redirect URLs 탭에 `Install to Workspace`를 눌러준뒤 권한을 수락해준다.(이미 슬랙앱이 설치된경우 Reinstall to Workspace 사용)


상기 과정을 수행하면 아래 사진처럼 `xoxb-`로 시작하는 토큰이 나오게되는데 나중에 그라파나 설정을 위해 필요하기때문에 메모장에 기록해두자.

![slack app token](https://lcc3108.github.io/img/2021/03/15/slack-bot-token.png)


### 채널 설정

앱이 성공적으로 만들었다면 슬랙 워크스페이스에 좌측하단의 앱 항목에 방금만든 Grafana가 생겼을 것이다.

그라파나 알림을 받기위해선 채널에 위에서 만든 앱인 Grafana를 추가해야한다.

채널은 새로만들거나 기존의 채널을 사용해도 상관없다.


원하는 채널로 들어가 채팅창에서 `@APP-NAME`로 메세지를 보내면 추가할 수 있다.

여기서는 grafana-alert 채널을 만들어 사용한다.

grafana-alert 채널에 `@Grafana`로 메세지를 보내면 Grafana 앱의 봇이 채널에 추가된다.


## 그라파나 설정

그라파나에서 대시보드 패널이미지를 포함시키기 위해선 그라파나 이미지 렌더러가 필요하다.


### 그라파나 이미지 렌더러(Grafana Image Renderer)

그라파나 이미지 렌더러가 없다면 그래프를 이미지화 시킬 수 없기때문에 해당 플러그인을 설치하거나 독립 실행형으로 배포할 수 있다.

[이미지 렌더러 문서](https://grafana.com/grafana/plugins/grafana-image-renderer/)에서 자세한 설치방법을 알아볼 수 있다.

- #### 그라파나 cli를 사용한 설치
  그라파나를 직접 설치해서 사용하고 있다면 cli를 통한 설치가 가능하다.

  설치과정에서 크로미움 관련 라이브러리 종속성이 있다.

  다만 설치후 그라파나를 재시작이 필요 하기때문에 도커로 돌리고 있다면 아래 방법을 사용해야한다.

  ``` bash
  grafana-cli plugins install grafana-image-renderer
  ```

- #### 독립실행형으로 설치


  환경에 따라 설정 값을 다르게 해줘야하기 때문에 [문서](https://github.com/grafana/grafana-image-renderer/blob/master/docs/remote_rendering_using_docker.md)를 보고 설정해야한다.


  - #### 로컬환경에서 도커를 사용하는경우

    그라파나 이미지 렌더러 실행

    ``` bash
    docker run -d \
    -p 8081:8081 \
    --name=grafana-image-renderer \
    -e "IGNORE_HTTPS_ERRORS=true" \
    grafana/grafana-image-renderer
    ```

    그라파나 실행

    ``` bash
    docker run -d \
    -p 3000:3000 \
    --name=grafana \
    -e "GF_RENDERING_CALLBACK_URL: http://localhost:3000/" \
    -e "GF_RENDERING_SERVER_URL: http://localhost:8081/render" \
    grafana/grafana
    ```
 


  - #### 쿠버네티스 그라파나 오퍼레이터의 경우

    [그라파나 오퍼레이터](https://github.com/integr8ly/grafana-operator)에 사이드카로 이미지렌더러를 추가시키면된다.

    같은 팟에 있기때문에 localhost로 통신이 가능하며 그라파나는 3000번포트 그라파나 이미지 렌더러는 8081이 기본값이기 때문에 아래와같이 설정하였다.


    ``` yaml
    ---
    apiVersion: v1
    data:
      GF_RENDERING_CALLBACK_URL: http://localhost:3000/
      GF_RENDERING_SERVER_URL: http://localhost:8081/render
    kind: ConfigMap
    metadata:
      creationTimestamp: null
      name: grafana-image-renderer
    ---
    apiVersion: integreatly.org/v1alpha1
    kind: Grafana
    metadata:
      name: grafana
    spec:
      deployment:
        envFrom:
        - configMapRef:
            name: grafana-image-renderer
      containers:
      - name: image-renderer
        image: grafana/grafana-image-renderer
        env:
        - name: IGNORE_HTTPS_ERRORS
          value: "true"
      #... 이하 생략
      ...
    ```


  - #### 쿠버네티스 그라파나의 경우

    아래와 같이 사이드카를 사용하여 로컬호스트 통신이 가능하다.

    만약 그라파나와 그라파나 이미지 렌더러를 각각의 팟으로 만들고 싶다면

    grafana-image-renderer의 서비스의 주소를 `GF_RENDERING_SERVER_URL`에 넣어주고

    grafana 서비스의 주소를 `GF_RENDERING_CALLBACK_URL`에 넣어준다.

    서비스의 주소는 `{ServiceName}.{Namespace}.svc.cluster.local` 양식을 가진다.

    ``` yaml
    ---
    apiVersion: v1
    data:
      GF_RENDERING_CALLBACK_URL: http://localhost:3000/
      GF_RENDERING_SERVER_URL: http://localhost:8081/render
    kind: ConfigMap
    metadata:
      creationTimestamp: null
      name: grafana-image-renderer
    ---
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: grafana
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: grafana
      template:
        metadata:
          name: grafana
          labels:
            app: grafana
        spec:
          containers:
          - name: grafana
            image: grafana/grafana:latest
            envFrom:
            - configMapRef:
              name: grafana-image-renderer
            #이하 설정 생략 ...
          - name: grafana-image-renderer
            image: grafana/grafana-image-renderer:latest
            env:
            - name: IGNORE_HTTPS_ERRORS
              value: "true"
    ---

    ```

## 이미지 렌더러 설치 검증 및 슬랙 채널 추가

그라파나 7.1.1 기준 작성

1. 그라파나 Alerting -> Notification channerls -> add channel

2. 사진처럼 입력한다.   
![grafana setting](https://lcc3108.github.io/img/2021/03/15/grafana-channel-setting.png)
   1. Name: 자유롭게 입력
   2. Type: Slack
   3. Default: true로 키게되면 알럿할 채널의 기본값이 된다.
   4. Include Image: 이미지 전송을 위해 켜야한다.   
   경고문구 없이 켜져야 렌더러 설치와 설정이 잘된것이다.
   5. Slack Setting
      1. Url: https://slack.com/api/chat.postMessage
      2. Recipient: #grafana-alert  
      3. Token: 슬랙설정에서 발급받은 토큰 입력 
3. Send Test로 메세지가 오는지 확인한다.

메세지가 슬랙으로 전송된다면 세이브를 눌러서 추가시켜준다.



## 문제해결

1. [Slack APP 설정페이지](https://api.slack.com/apps/)에서 앱이 잘 생성됐는지 Workspace가 올바른지 확인

2. 1번의 페이지에서 해당 앱을 클릭한다.
   1.  OAuth & Permissions 탭
       1.  Bot Token Scopes에 `chat:write`와 `files:write` 권한 확인
       2.  Reinstall to Workspace 한번 실행
3. 슬랙 워크스페이스에서 왼쪽하단 앱 항목에 생성한 앱이 존재하는지 확인
4. grafana-alert 채널에 접속하여 채팅에 `@APP-NAME` 입력후 전송


