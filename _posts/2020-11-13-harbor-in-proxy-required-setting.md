---
layout: post
title: Harbor unknown blob에러
categories: [Docker]
tags: [Harbor]
comments: true
---


### 사용하게된 이유

회사 서비스를 dockerization을 한뒤 nginx를 통해 인스턴스 내부에서 Blue/Green 배포를 하기위해 직접 도커파일을 작성하고 jenkins pipline을 작성하였다.
물론 순탄치 않은 과정이였지만 회사 서비스 이미지를 퍼블릭 레포지토리에 저장 할 수 없어서 프라이빗 레포지토리인 harbor를 사용하였다. 

### 산뜻한 출발

설치는 docker-compose를 사용하여 원하는 설정만 해주고 스크립트만 실행하면 된다. 

그 후 간단한 테스트를 수행하기 위해 도커이미지 푸쉬와 빌드를 해보았고 성공하였다. 

젠킨스를 설정하면서 DinD DooD와 씨름하면서 설정을 DooD로 하였고
리다이렉션용 서버에 하버는 신규설치를 젠킨스는 마이그레이션을 진행하였다.

아파치 웹서버를 사용하고 있었기때문에 Name Virtual Host로 ProxyPass를 사용하여 각 url에 서비스를 매핑시켰다.
모든 설정을 끝마치고 기분좋게 젠킨스를 돌리는데 빨간불이 떴다.

도커 빌드, 태깅 까지 잘돼는데 푸쉬할때 아래와같이 어느정도 진행중에 unknown blob이라는 에러가 발생하였다.

![harbor-error.png](https://lcc3108.github.io/img/2020-11/harbor/Untitled.png)
바로 구글님께 여쭈어 보았더니 [harbor.yml에 뭔가를 추가해라](https://github.com/docker/distribution/issues/970#issuecomment-284227065), 




호스트 nginx 프록시에 header를 전달해주는 것을 넣어라(하지만 httpd라 넘어감),

[httpd.conf파일에 아래와같이 추가해라](https://stackoverflow.com/questions/51508146/blob-unknown-when-pushing-to-custom-registry-through-apache-proxy) 등 많은 방법들을 시도해 보았지만 작동하지않았다.

### 문제해결

그러다가 harbor의 공식문서에 [Troubleshooting문서](https://goharbor.io/docs/2.1.0/install-config/troubleshoot-installation/)가 존재하길래 보았는데 nginx라던가 클라우드에서 제공하는 LB 즉 프록시를 사용하게 되면은 아래의 설정을 주석처리하거나 지워야한다.

```groovy
proxy_set_header X-Forwarded-Proto $scheme;
```

지우는 법은 harbor의 설치경로는 아래와같은 파일 경로를 가지고 있을 것이다. 

![harbor-directory-ls.png](https://lcc3108.github.io/img/2020-11/harbor/Untitled%201.png)

./common/config/nginx/nginx.conf 에서 위의 proxy_set_header X-Forwarded-Proto $scheme; 설정 값을 지워주면된다. 
지워준뒤 docker ps 해서 나오는 go harbor nginx 컨테이너의 이름을 아래의 {HARBOR_NGINX_NAME}에 적어주면된다.

```groovy
docker exec -it {HARBOR_NGINX_NAME} nginx -s reload
```

### 수정된 nginx.conf 파일
```groovy
worker_processes auto;
pid /tmp/nginx.pid;

events {
  worker_connections 1024;
  use epoll;
  multi_accept on;
}

http {
  client_body_temp_path /tmp/client_body_temp;
  proxy_temp_path /tmp/proxy_temp;
  fastcgi_temp_path /tmp/fastcgi_temp;
  uwsgi_temp_path /tmp/uwsgi_temp;
  scgi_temp_path /tmp/scgi_temp;
  tcp_nodelay on;

  # this is necessary for us to be able to disable request buffering in all cases
  proxy_http_version 1.1;

  upstream core {
    server core:8080;
  }

  upstream portal {
    server portal:8080;
  }

  log_format timed_combined '$remote_addr - '
    '"$request" $status $body_bytes_sent '
    '"$http_referer" "$http_user_agent" '
    '$request_time $upstream_response_time $pipe';

  access_log /dev/stdout timed_combined;

  server {
    listen 8080;
    server_tokens off;
    # disable any limits to avoid HTTP 413 for large image uploads
    client_max_body_size 0;

    # Add extra headers
    add_header X-Frame-Options DENY;
    add_header Content-Security-Policy "frame-ancestors 'none'";

    # costumized location config file can place to /etc/nginx/etc with prefix harbor.http. and suffix .conf
    include /etc/nginx/conf.d/harbor.http.*.conf;

    location / {
      proxy_pass http://portal/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

      # When setting up Harbor behind other proxy, such as an Nginx instance, remove the below line if the proxy already has similar settings.
      #proxy_set_header X-Forwarded-Proto $scheme;
      
      proxy_buffering off;
      proxy_request_buffering off;
    }

    location /c/ {
      proxy_pass http://core/c/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

      # When setting up Harbor behind other proxy, such as an Nginx instance, remove the below line if the proxy already has similar settings.
      #proxy_set_header X-Forwarded-Proto $scheme;
      
      proxy_buffering off;
      proxy_request_buffering off;
    }

    location /api/ {
      proxy_pass http://core/api/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

      # When setting up Harbor behind other proxy, such as an Nginx instance, remove the below line if the proxy already has similar settings.
      #proxy_set_header X-Forwarded-Proto $scheme;
      
      proxy_buffering off;
      proxy_request_buffering off;
    }

    location /chartrepo/ {
      proxy_pass http://core/chartrepo/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

      # When setting up Harbor behind other proxy, such as an Nginx instance, remove the below line if the proxy already has similar settings.
      #proxy_set_header X-Forwarded-Proto $scheme;
      
      proxy_buffering off;
      proxy_request_buffering off;
    }

    location /v1/ {
      return 404;
    }

    location /v2/ {
      proxy_pass http://core/v2/;
      proxy_set_header Host $http_host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

      # When setting up Harbor behind other proxy, such as an Nginx instance, remove the below line if the proxy already has similar settings.
      #proxy_set_header X-Forwarded-Proto $scheme;
      proxy_buffering off;
      proxy_request_buffering off;

      proxy_send_timeout 900;
      proxy_read_timeout 900;
    }

    location /service/ {
      proxy_pass http://core/service/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

      # When setting up Harbor behind other proxy, such as an Nginx instance, remove the below line if the proxy already has similar settings.
      #proxy_set_header X-Forwarded-Proto $scheme;

      proxy_buffering off;
      proxy_request_buffering off;
    }

    location /service/notifications {
      return 404;
    }
  }
}

```