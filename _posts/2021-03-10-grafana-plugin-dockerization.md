---
layout: post
title: Grafana Plugin 개발환경 도커라이제이션
categories: [Grafana]
tags: [Grafana, Grafana Plugin]
comments: true
---


- [개요](#개요)
- [도커라이제이션](#도커라이제이션)

# 개요

서비스를 운영하던때 AWS CloudWatch를 그라파나와 연동시켜 모니터링을 하였다.

유저수에 따른 부하량의 정도를 알면 좋겠다고 생각했고 유저수는 Google Analytics(GA)를 통해 측정되고 있었다.

그러나 그라파나에는 GA 플러그인이 없었고 go공부도 할겸 개발해보기로 마음먹었다.

어느정도 개발을 한 뒤 다른일에 밀려 멈춰있었으나 다시 시작하면서 블로그로 기록을 남긴다.

# 도커라이제이션

그라파나 데이터소스 백엔드 플러그인으로 개발을 하기위해선 아래의 요구사항이 필요하다.

- Grafana 7.0
- Go 1.14+
- Mage
- NodeJS
- yarn

Go, Mage, NodeJS Yarn을 설치하고 세팅하는데 번거러울 수 있고 도커를 알고있으니 도커라이제이션을 해보았다.

그라파나 플러그인 개발시 디렉토리 구조는 아래와 같다.

```
├── Magefile.go
├── appveyor.yml
├── go.mod
├── go.sum
├── jest.config.js
├── package.json
├── dist(Go와 React 빌드결과물)
├── pkg (Go src)
│   ├── analytics.go
│   ├── datasource.go
│   ├── ga-client.go
│   ├── grafana.go
│   ├── main.go
│   ├── metadata.go
│   ├── models.go
│   └── setting.go
├── src (React src)
│   ├── ConfigEditor.tsx
│   ├── DataSource.ts
│   ├── DropZone.tsx
│   ├── JWTConfig.tsx
│   ├── QueryEditor.tsx
│   ├── img
│   │   └── logo.svg
│   ├── module.ts
│   ├── plugin.json
│   └── types.ts
├── tsconfig.json
└── yarn.lock
```

백엔드는 go를 사용하고 프론트는 react를 사용한다.

빌드시 백엔드는 mage라는 도구를 사용하며 프론트는 yarn을 사용한다.

빌드결과물은 dist라는 폴더에 저장되며 해당폴더를 /var/lib/grafana/plugins 폴더에 넣어주면 플러그인으로써 인식이된다.

```Dockerfile
FROM golang:1.16-alpine as go_build
WORKDIR /build
COPY . .
RUN go run mage.go -v

FROM node:12-alpine as node_build
WORKDIR /build
COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile
COPY . .
RUN yarn build

FROM grafana/grafana:7.4.3
ARG PLUGINS_NAME=google-analytics
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=${PLUGINS_NAME}
COPY --from=go_build /build/dist /var/lib/grafana/plugins
COPY --from=node_build /build/dist /var/lib/grafana/plugins

```

멀티스테이지 빌드로 Go와 Yarn을통해 각각 빌드했다.

go의 경우 빌드를 위해 mage가 필요한대 아래의 mage.go 를 사용하게되면 설치하지않고 사용 할 수 있다.

``` go
// +build ignore
package main

import (
	"os"
	"github.com/magefile/mage/mage"
)

func main() { os.Exit(mage.Main()) }
```


yarn의 경우 캐시활용을 극대화 하기위해서 package.json과 yarn.lock을 먼저 복사한 뒤
`RUN yarn --frozen-lockfile` 명령어를 통해 node_modules를 설치해준다.

이는 package.json이나 yarn.lock이 변경된 경우에만 도커 캐시를 사용하지않고 새로 종속성을 설치한다.(변경사항 없을시 캐시 사용)

`ARG PLUGINS_NAME=google-analytics` ARG를 `--build-arg`를 통해 넣을 수 있게 하여 다른 프로젝트에서도 사용가능하게 했다.

```
docker build . -t --build-arg PLUGINS_NAME={YOUR_PLUGIN_NAME} blackcowmoo/grafana-ga-ds
docker run --rm -p 3000:3000  --name=blackcowmoo-grafana-ga-ds blackcowmoo/grafana-ga-ds
```

그뒤 그라파나의 이미지에 `COPY --from=...`을 통해 빌드 결과물을  /var/lib/grafana/plugins에 넣어줬다.