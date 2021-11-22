---
layout: post
title: Bitbucket workspace webhook 설정하기(all repository)
categories: [Bitbucket]
tags: [Bitbucket]
comments: true
---

- [개요](#개요)


## 개요 
비트버킷에서 레포지토리의 아래와 같은 이벤트를 수신할 수 있는 웹훅을 설정할 수 있다.

- 레포지토리
  - 푸쉬
  - 포크
  - 업데이트
  - 커밋에대한 커멘트 생성
  - 빌드 상태
- 이슈
  - 생성
  - 업데이트
  - 커멘트 생성
- PR
  - 생성
  - 업데이트
  - 승인
  - 승인 해제
  - 변경요청 생성
  - 변경요청 제거
  - 머지
  - 거부
  - 커멘트 생성, 업데이트, 삭제
  
설정방법은 [공식문서](https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/)에서 찾아 볼 수 있다.

주로 웹훅은 CI/CD에서 자동화를 위해 사용되며 이를 위해 레포지토리별 웹훅이 아닌 워크스페이스 웹훅을 설정해야할때가 있다.

비트버킷 페이지에서는 해당 워크스페이스 웹훅을 변경하려고 해도 `READ ONLY` 상태라 변경할 수 없게 되어있다.

![bitbucket-page](https://lcc3108.github.io/img/2021/11/18/bitbucket.png)

하지만 비트버킷 [api docs](https://developer.atlassian.com/bitbucket/api/2/reference/resource/workspaces/%7Bworkspace%7D/hooks)에는 존재해서 해당 api를 직접 호출하는 방식으로 추가할 수 있다.

```bash
$ curl -u {YOUR_BITBUCKET_ID} -X POST -H 'Content-Type: application/json'  https://api.bitbucket.org/2.0/workspaces/{YOUR_WORKSPACE_NAME}/hooks/ \
-d '{
      "description": "jenkins-hook",
      "url": "https://{JENKINS_URL}/bitbucket-hook/",
      "active": true,
      "events": [
        "repo:push"
      ]
}'
```

비트버킷 웹훅은 현재 시크릿 기능을 지원하지 않음으로 https를 권장한다.

시크릿이 없을 경우 악의적인 사용자가 보내는 요청을 구분할 수 없기때문이다.

또한 비트버킷 웹훅 IP 대역을 확인해서 해당 IP에서만 오는 웹훅을 받도록 설정하는 것이 보안상 좋다.

해당 아이피 대역대는 [비트버킷 홈페이지](https://support.atlassian.com/organization-administration/docs/ip-addresses-and-domains-for-atlassian-cloud-products/#AtlassiancloudIPrangesanddomains-OutgoingConnections)에서 확인 할 수 있다.

주소로 남기는 이유는 해당 주소가 변경 될 수 있는데 블로그 글에서 참조한 상수값으로 피해를 입을 수 있기때문이다.