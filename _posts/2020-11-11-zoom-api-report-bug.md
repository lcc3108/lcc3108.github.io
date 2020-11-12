---
layout: post
title: Zoom API Meeting Report 버그
categories: [Zoom]
tags: [Zoom]
comments: true
---

회사에서 Zoom API를 사용하여 LMS에서 원클릭으로 Zoom에 로그인없이 회의 생성 및 참가하는 프로젝트를 진행하였고 완성시켰다.

Zoom 회의가 끝난다음에 참석자들의 출석기록을 받아볼 수 있는 API /report/meetings/{meetingId}/participants 를 사용하여 출석 여부를 체크하고 있는데 몇몇 참가자들의 참가 시간이 0으로 뜨는 버그가 발생하였다.

[Zoom API 문서](https://marketplace.zoom.us/docs/api-reference/zoom-api/reports/reportmeetingparticipants)에 따르면 아래와 같이 응답 예시가 나와있다. duration은 참가한시간을 초단위로 나타낸다.



```json
{
  "page_count": "1",
  "page_size": "30",
  "total_records": "1",
  "next_page_token": "",
  "participants": [
    {
      "id": "dskfjladjskfl",
      "user_id": "sdfjkldsfdfgdfg",
      "name": "Riya",
      "user_email": "riya@jdfghsdfgsd.fdjfhdf",
      "join_time": "2019-02-01T12:34:12.660Z",
      "leave_time": "2019-03-01T12:34:12.660Z",
      "duration": "20"
    }
  ]
}
```
해당 json 형식의 응답을 gson을 이용하여 파싱하고있다.
gson의 경우 옵션을 줄 경우 Zoom API에서 제공하는 snake case(user_email같은 언더바 사용)를 java의 camel case(userEmail과 같은 낙타체)를 매핑 시켜준다.

```java
Gson gson = new GsonBuilder().setFieldNamingPolicy(FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES).create();
//gson을 사용하여 클래스와 매핑시킬 json값이 배열일 경우 ClassName[].class를 아닐경우 ClassName.class를 사용한다.
gson.fromJson(jsonValue, MeetingParticipantDTO[].class)
```

그래서 아래와 같은 클래스를 만들어서 gson을 이용하여 파싱을 하였다.

```java
@Builder
@Getter
public class MeetingParticipantDTO {
    String id;
    int duration;
    String attentivenessScore;
    String joinTime;
    String leaveTime;
    String name;
    String userEmail;
}
```

여기서 int에 0이 들어갈 경우는 java에서 int는 primitive 데이터 타입이기때문에 null을 넣을수 없다.

그러므로 파싱할 수 없거나 비어있거나 실제로 0이여야한다.

오류를 찾기위해 실제로 API를 날려보았다. 그런데 응답값에서 duration에 잘못된 값이 들어가 있거나 0인 경우가 없었다. 상식적으로 참가자목록에 남아있다면 최소한 1초라도 참가해야하는데 그래서 자체적으로 테스트를 하기 시작하였다.

아주 적은경우 발생하였기때문에 끝점에 대해 즉 중간정도의 값이 아닌 매우크거나 매우작은 값을 가지도록 강의시간, 참가자수, 레포트 조회시간등 을 변수로 생각하여 테스트 해보았다.

테스트 결과 Zoom 미팅이 끝나고 1분내외로 결과를 조회하는 API를 호출시 몇몇 참가자들의 참가시간이 0으로 왔다. 아마도 집계를 하는중인데도 status200과 함께 결과를 전송해주는 듯 하다.

그래서 해당 버그를 [Zoom 개발자 포럼에 레포팅](https://devforum.zoom.us/t/meeting-end-immediately-call-meeting-participants-report-duration-set-0/35545) 하였다.

