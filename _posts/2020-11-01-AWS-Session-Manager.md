---
layout: post
title: AWS SSM으로 Private Subnet 인스턴스 접근하기(Bastion Host 대체)
categories: [AWS]
tags: [AWS, SSM, Session Manager, System Manager ]
comments: true
---

- [필요 조건](#필요-조건)
- [설치방법](#설치방법)
  - [IAM 역할에 SSM허용하는 정책추가](#iam-역할에-ssm허용하는-정책추가)
    - [인스턴스에 IAM 역할이 없을때](#인스턴스에-iam-역할이-없을때)
    - [기존에 쓰는 IAM이 역할(Role)이 있을때](#기존에-쓰는-iam이-역할role이-있을때)
  - [인스턴스에 IAM 역할 부여](#인스턴스에-iam-역할-부여)
    - [새로운 인스턴스 생성시](#새로운-인스턴스-생성시)
    - [기존인스턴스에 추가시](#기존인스턴스에-추가시)
  - [AWS System Manager(SSM) 설정](#aws-system-managerssm-설정)
  - [Session Manager 사용](#session-manager-사용)
  - [Session Manager 로깅 설정](#session-manager-로깅-설정)

---

AWS에서 Private Subnet을 사용하여 서버를 구성하는 경우가 있다.

Private Subnet의 경우 외부에서 접속이 불가능하기 때문에 Basion Host를 Public에 배치하면서 같은 VPC에 두어 Bastion Host를 통해 Private Subnet의 인스턴스에 접속 할 수있게해주는 관문 역할을 해준다.

Bastion Host에 대한 자세한 설명과 아키텍쳐는 AWS 문서로 대체한다.

![Bastion-Host-아키텍쳐.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled.png)

<center>

[AWS Bastion Host 공식 문서 및 사진 출처](https://docs.aws.amazon.com/ko_kr/quickstart/latest/linux-bastion/overview.html)

</center>


Bastion Host 사용시 보안적 이점이 있지만 인스턴스를 따로 관리해주면서 인스턴스 비용이 나온다는 점을 AWS System Manger(SSM) 또는 시스템 매니저의 Session Manager를 통해 무료로 대체 시킬 수 있다.

또한 IAM 유저를 생성하여 Session Manager에 권한을 주고 로깅을 통해 유저별로 어떤 행위를 했는지 로깅이 간편해진다.

## 필요 조건

Session Manager는 AWS System Manager의 하위기능이기 때문에 System Manager의 조건을 충족해야한다. [SSM 지원 OS](https://docs.aws.amazon.com/systems-manager/latest/userguide/prereqs-operating-systems.html)목록에 있다면 사용이 가능하다.



## 설치방법

인스턴스에 Session Manager 권한을 가지는 IAM을 부여하게되면 SSM 메뉴에서 인벤토리 수집을 통해 인스턴스에 SSM을 원격으로 설치할 수 있다.
### IAM 역할에 SSM허용하는 정책추가

#### 인스턴스에 IAM 역할이 없을때

인스턴스에 IAM 역할이 지정되어 있지않을때는 **AmazonSSMManagedInstanceCore**라는 정책을 가진 역할을 생성해야한다.

1. 역할과 정책 생성을 위해 IAM 메뉴로 이동한뒤 먼저 역할을 클릭한다.

    ![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%201.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%201.png)

2. 역할만들기 창에서 System Manager를 찾아준다.

    ![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%202.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%202.png)

3. 권한 정책에서 **AmazonSSMManagedInstanceCore** 를 검색하여 체크해준다.

    ![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%203.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%203.png)

4. 태그를 알맞게 지정해준다(옵션)
5. 알아보기 쉽게 역할이름을 만들어준다.

    ![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%204.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%204.png)

#### 기존에 쓰는 IAM이 역할(Role)이 있을때

해당역할에  **AmazonSSMManagedInstanceCore**라는 정책(Policies)를 추가해주면 된다.

인스턴스 역할을 확인하는 방법은 아래와같다.

- 인스턴스 클릭시 IAM 역할칸 확인

    ![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%205.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%205.png)

- 간단히 존재 유무만 확인하고 싶다면 위의 화면 우상단 톱니바퀴를 눌러 속성에서 IAM 인스턴스 프로파일 ARN을 켜주면 확인할 수 있다.

    ![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%206.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%206.png)

이제 IAM을 특정지울 수 있게되었다.

IAM에서 역할로 들어간뒤 해당 IAM을 클릭하게되면 아래와 같은 창이 뜨게 된다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%207.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%207.png)

정책 연결 버튼을 클릭한뒤 **AmazonSSMManagedInstanceCore** 정책을 연결시켜주면된다.

여기까지 진행하게되면 SSM 연결을 위한 역할 생성이 끝나게된다.

### 인스턴스에 IAM 역할 부여

#### 새로운 인스턴스 생성시

3.인스턴스 구성에서 위에서만든 IAM 역할을 추가시켜 준다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%208.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%208.png)

#### 기존인스턴스에 추가시

EC2화면에서 IAM을 변경하고 싶은 인스턴스를 우클릭한다.

보안탭에서 IAM 역할 수정을 선택한다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%209.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%209.png)

역할수정 화면에서 위에서만든 IAM 역할을 부여해준다.

### AWS System Manager(SSM) 설정

SSM은 인프라를 제어하기 위한 AWS 서비스로써 운영관리, 어플리케이션관리, 작업, 인스턴스 노드 관리 등을 지원한다. 자세한내용은 [AWS SSM 공식문서](https://docs.aws.amazon.com/ko_kr/systems-manager/latest/userguide/what-is-systems-manager.html)를 참고하길 바란다.



Session Manager또한 SSM의 기능중 하나이기 때문에 사용하기위해서는 SSM을 설정해줘야한다.

AWS에서 AWS System Manager 서비스로 들어가준다. 빠른설정을 누르게되면 아래의 화면처럼 설정할 수 있는 창이 나오게된다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2010.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2010.png)

SSM의 기능중 인스턴스에 특정 프로그램을 설치하여 관리 할 수 있기때문에 아래의 옵션을 필요하다면 선택해준다.

Configuration options 탭

- [ ]  Install and configure the CloudWatch agent (더 자세한 모니터링을 위한 툴 설치)
- [ ]  Update the CloudWatch agent once every 30 days(해당툴을 30일마다 업데이트)

대상인스턴스를 고르는 화면에서 인스턴스 태그가 잘되어있다면 첫번째방벙을 사용한다.
인스턴스가 매우적다면 두번째인 수동추가나 네번째인 모든인스턴스 추가를 추천한다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2011.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2011.png)

Enable 버튼을 누르게되면 SSM 설정이 자동으로 진행된다.

위에서 선택한 대상인스턴스에 대해서 연결이라는 작업을 통해 SSM Agent를 설치한다.

### Session Manager 사용

설정을 마친뒤 Session Manager 메뉴를 클릭한뒤 세션 시작을 누른다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2012.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2012.png)

SSM Agent가 설치된 인스턴스목록이 뜨게되는데 인스턴스 한대를 선택한뒤 세션 시작을 누른다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2013.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2013.png)

아래와 같이 쉘이 뜨게되면서 인스턴스에 접속이 된다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2014.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2014.png)

### Session Manager 로깅 설정

Session Manager의 로그를 남기고싶다면 해당메뉴로 들어간뒤 기본설정을 선택한다.

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2015.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2015.png)

CloudWatch와 S3를 통해 로그를 저장 할 수 있다.(추가요금 발생)

![https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2016.png](https://lcc3108.github.io/img/2020-11/AWS-SSM/Untitled%2016.png)