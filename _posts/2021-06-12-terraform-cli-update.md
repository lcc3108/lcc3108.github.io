---
layout: post
title: Terraform cli 0.12 -> 0.14 업데이트 후기
categories: [Terraform]
tags: [Terraform]
comments: true
---


- [개요](#개요)
- [업그레이드 진행전 준비하면 좋은 항목](#업그레이드-진행전-준비하면-좋은-항목)
  - [tfenv](#tfenv)
    - [설치법](#설치법)
      - [맥북](#맥북)
      - [bash 사용중인 리눅스](#bash-사용중인-리눅스)
      - [zsh 사용중인 리눅스](#zsh-사용중인-리눅스)
    - [사용법](#사용법)
  - [terraform plan 실행](#terraform-plan-실행)
  - [terraform provider 캐시 설정(옵션)](#terraform-provider-캐시-설정옵션)
- [0.12에서 0.13](#012에서-013)
  - [개요](#개요-1)
  - [업그레이드](#업그레이드)
  - [검증](#검증)
- [0.13에서 0.14](#013에서-014)
  - [개요](#개요-2)
  - [업그레이드](#업그레이드-1)
- [문제 해결](#문제-해결)

## 개요

회사에서 사용하는 Terraform cli와 aws module의 버전이 낮아서 업데이트 중 겪은 상황

어떠한 명령어를 사용하여 간단하게 여러개의 테라폼 디렉토리에 버전 업데이트에 맞는 state파일을 구성하였는지 정리하는 글이다.

0.12에서 0.15까지 업그레이드 하는게 목표였지만 0.15부터는 문법적 변화도 크기때문에 0.14까지만 기록으로 남긴다.


## 업그레이드 진행전 준비하면 좋은 항목

### tfenv
terraform은 현재 1.0.0이 나왔으며 이는 0.15.x버전대의 연속된 버전이라고 명시되어있다.

위와같이 테라폼은 다양한 버전이 있으며 해당 버전을 매번 변경하는 작업은 매우 번거롭다.

이때 tfenv라는 테라폼 버전 매니저를 사용하게된다면 손쉽게 변경 할 수 있다.
이는 node의 nvm과 같은 툴로써 원하는 테라폼 버전을 손쉽게 다운받고 변경하게 도와주는 cli 도구이다.

#### 설치법

##### 맥북
```
brew install tfenv
```
##### bash 사용중인 리눅스
일반 리눅스의 bash shell을 사용할 경우 아래 명령어를 통해 사용이 가능하다.
```bash
$ git clone https://github.com/tfutils/tfenv.git ~/.tfenv
$ echo 'export PATH="$HOME/.tfenv/bin:$PATH"' >> ~/.bash_profile
$ . ~/.bash_profile
```
##### zsh 사용중인 리눅스
```bash
$ git clone https://github.com/tfutils/tfenv.git ~/.tfenv
$ echo 'export PATH="$HOME/.tfenv/bin:$PATH"' >> ~/.zshrc
$ . ~/.zshrc
```

#### 사용법
tfenv 명령어를 실행시키면 아래와 같이 명령어에 사용 할 수 있는 commands가 나온다.
```bash
$ tfenv
tfenv 2.2.2
Usage: tfenv <command> [<options>]

Commands:
   install       Install a specific version of Terraform
   use           Switch a version to use
   uninstall     Uninstall a specific version of Terraform
   list          List all installed versions
   list-remote   List all installable versions
   version-name  Print current version
   init          Update environment to use tfenv correctly.
```

tfenv의 자세한내용은 [해당 레포지토리](https://github.com/tfutils/tfenv)에서 확인 가능하다.

### terraform plan 실행
업그레이드을 하게된다면 예기치 못한 문제가 발생 할 수 있다.

이때 해당 문제가 업그레이드 때문인지 원래 있었던 문제인지를 정확하게 하기 위해서는 이전버전에서 모두 terraform plan의 결과를 저장하거나 변경점이 없는 상태에서 시작하는게 좋다.

### terraform provider 캐시 설정(옵션)
테라폼은 프로바이더를 받을때 기본적으로 캐시를 사용하지않고 매번 받는다.

이는 여러개의 워크스페이스를 init할때 시간이 오래걸리는 원인이다.

[공식문서](https://www.terraform.io/docs/cli/config/config-file.html)에 따르면 두가지 방법으로 캐시를 활성화 시킬 수 있다.

두가지 방법모두 cache_dir로 사용될 디렉토리는 사용자가 만들어줘야한다.

1. ~/.terraformrc 에 아래 내용추가
```
plugin_cache_dir   = "$HOME/.terraform.d/plugin-cache"
```
2. 환경변수 사용
```
export TF_PLUGIN_CACHE_DIR="$HOME/.terraform.d/plugin-cache"
```

## 0.12에서 0.13

### 개요

[업그레이드 가이드 문서](https://www.terraform.io/upgrade-guides/0-13.html)에 따르면 프로바이더에 대한 지원방식의 변경이 있다.

### 업그레이드

먼저 0.12버전에서 0.13으로 업그레이드 하기 위해서는 terraform cli버전을 0.13.x로 해준다.(이때 x는 최신버전을 사용하였다)

```bash
tfenv install 0.13.7
tfenv use 0.13.7
```

terraform cli 버전을 확인하기위해 terraform 명령어를 실행한다.
```bash
$ terraform
...
All other commands:
    0.12upgrade        Rewrites pre-0.12 module source code for v0.12
    0.13upgrade        Rewrites pre-0.13 module source code for v0.13
```
위와같이 0.13upgrade 명령어를 지원한다.

모든 테라폼 레포지토리의 워크스페이스 별로 해당 명령어를 실행시켜줘야한다.

terraform을 사용중인 깃레포지토리로 이동한다.

아래의 명령어 실행시 tf가 있는 모든디렉토리에 terraform 0.13upgrade가 자동으로 실행된다.

```bash
find . -name '*.tf' | xargs -n1 dirname | grep -v "\.terraform" | uniq | xargs -n1 terraform 0.13upgrade -yes 
```
위의 명령어에 대해서 "|" 표시로 번호로 구분하여 설명하자면

1. 하위디렉토리에서 *.tf파일을 찾는다.
2. 1번의 찾은 파일들의 디렉토리의 이름을 알아낸다.
3. 2번에서 .terraform 디렉토리를 제외한 목록을 출력한다.
4. 3번에서 중복된 디렉토리들을 목록에서 제거한다.
5. 4번의 디렉토리를 $DIR라고하면 terraform 0.13upgrade -yes $DIR 를 실행한다.


명령어 실행시 version.tf 가 생성되며 아래와같이 terraform cli 버전 0.13 이상을 요구하게 된다.

```h
terraform {
  required_version = ">= 0.13"
}
```
### 검증

terraform plan을 하는 과정까지 오류가 발생하지 않는다면 업그레이드를 검증 할 수 있다.
1. terraform init
```bash
find . -name '*.tf' | xargs -n1 dirname | grep -v "\.terraform"  | uniq |  xargs -n1 -I {} bash -c 'echo {} &&  terraform init {}'
```
2. terraform plan
```bash
find . -name '*.tf' | xargs -n1 dirname | grep -v "\.terraform"  | uniq | xargs -n1 -I {} bash -c 'echo {} &&  terraform plan {}'
```
3. terraform apply
변경사항이 없더라도 terraform apply를 통해 tf.state파일에 내용 업데이트를 해준다.

## 0.13에서 0.14

### 개요
0.13에서 0.14로 업그레이드시 눈에 띄는 큰 변경점은 .terraform.lock.hcl 파일이 생긴다는 점이다.

node에서 package.json의 종속성을 설치하면 package-lock.json 이나 yarn.lock이 생기듯이 terraform에서도 모듈들의 해시값을 저장한다.

### 업그레이드

먼저 terraform cli 버전을 0.14.x로 변경한다.
```bash
tfenv install 0.14.11
tfenv use 0.14.11
```

문법적 변경사항이 없기때문에 init -> plan -> apply 순서대로 진행하면된다.

1. terraform init
```bash
find . -name '*.tf' | xargs -n1 dirname | grep -v "\.terraform"  | uniq |  xargs -n1 -I {} bash -c 'echo {} &&  terraform init {}'
```
2. terraform plan
```bash
find . -name '*.tf' | xargs -n1 dirname | grep -v "\.terraform"  | uniq | xargs -n1 -I {} bash -c 'echo {} &&  terraform plan {}'
```
3. terraform apply
변경사항이 없더라도 terraform apply를 통해 tf.state파일에 내용 업데이트를 해준다.

또한 version.tf의 required_version 값을 0.14로 변경해주는 것이 좋다.


## 문제 해결
만약 init이나 plan중 아래와 같이 provider error가 발생한다면 아래의 문제해결을 따라하면 해결된다.
```
Error: Provider configuration not present

Initializing the backend...

Error: Invalid legacy provider address

This configuration or its associated state refers to the unqualified provider
"random".

You must complete the Terraform 0.13 upgrade process before upgrading to later
versions.
```

해당 문제는 0.12에서 0.13 업그레이드시 apply를 안했을시 발생한다.

해당문제가 발생하는 곳에서 `terraform providers` 명령어 실행시 `registry.terraform.io/-/aws` 같은 `-`형식의 provider가 존재하면 에러가 발생하게 된다.

예시로 든 `registry.terraform.io/-/aws`의 경우 아래와 같은 명령어로 해결이 가능하다.
```
terraform state replace-provider 'registry.terraform.io/-/aws' 'registry.terraform.io/hashicorp/aws'
```

만약에 끝이 `aws`대신에 `random`이나 `null`일 경우 아래의 명령어를 사용하면된다.
```bash
terraform state replace-provider -/random registry.terraform.io/hashicorp/random
terraform state replace-provider -/null registry.terraform.io/hashicorp/null
```