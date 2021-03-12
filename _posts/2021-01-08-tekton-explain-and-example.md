---
layout: post
title: Tekton Pipeline 소개
categories: [Tekton]
tags: [Tekton]
comments: true
---

- [tekton pipeline 프로젝트](#tekton-pipeline-프로젝트)
  - [설치](#설치)
    - [pipeline](#pipeline)
      - [cli](#cli)
      - [OLM을 통한 operator 설치](#olm을-통한-operator-설치)
    - [Dashboard](#dashboard)
      - [tekton dashboard](#tekton-dashboard)
      - [okd-console](#okd-console)
  - [Task](#task)
    - [예시](#예시)
  - [Pipeline](#pipeline-1)
    - [예시](#예시-1)
  - [참고 URL](#참고-url)

tekton은 kubernetes 리소스 형식으로 선언된 CI/CD를 제공해준다.

우리가 알고있는 젠킨스나 스핀에이커 등 기타 도구없이도 오직 쿠버네티스 오브젝트를 사용하여 CI/CD가 가능하다. 

Tekton은 pipeline과 trigger로 진행되고 있는데 이번 포스트에서는 pipeline에 대해서만 기술한다.

# tekton pipeline 프로젝트

tekton pipeline 프로젝트는 쿠버네티스의 커스텀리소스(CR)을 사용하여 CI/CD 파이프라인을 구축한다.

tekton 알파인 Run을 제외한 5개의 엔티티와 엔티티에서 사용되는구성요소들이 있다.


| 이름               | 설명                                             |
| ------------------ | ------------------------------------------------ |
| Parameters(params) | 파이프라인이나 태스크에 주어지는 인자            |
| Resources          | 파이프라인리소스를 입력과 출력으로 참조가능      |
| Steps              | 지정된 작업을 실행하는 컨테이너(물리적 최소단위) |
| Workspaces         | 태스크 공유 저장공간                             |
| results            | 일련의 작업이 진행된 결과를 저장 및 공유         |
	 
| 이름             | 설명                                            |
| ---------------- | ----------------------------------------------- |
| (Cluster)Tasks   | 스탭 집합의 순차 실행방법 정의(논리적 최소단위) |
| TasksRuns        | 태스크를 인스턴스화                             |
| Pipelines        | 태스크 집합이 실행방법 정의                     |
| PipelinesRuns    | 파이프라인을 인스턴스화                         |
| PipelineResource | git, image, cluster등 태스크의 인풋 아웃풋      |
	

![pipeline.jpg](https://lcc3108.github.io/img/2021/01/08/pipeline.jpg)

대부분의 요소를 포함한 플로우는 위 그림과 같다.

<details markdown="1">
<summary> 요리에 비유</summary>
  tekton pipeline의 엔티티들은 요리 레시피를 보고 요리를 한다고 생각하면 쉽다.

  먼저 스탭은  재료씻기, 재료손질, 물올리기, 불키기, 볶기, 상차리기 등 한가지 일에대해 설명한다.

  태스크는 아래와같이 연관성있는 스텝 집합으로써  논리적 일의 최소단위이다.

  - 사전준비 ⇒ 재료씻기 → 재료 손보기

  - 국끓이기(인풋 재료, 아웃풋 요리) ⇒ 물올리기 ⇒ 불키기

  - 볶음밥(인풋 재료, 아웃풋 요리) ⇒ 불키기 ⇒ 볶기

  - 상차리기(인풋 요리들) ⇒ 상으로 옮긴다.

  레시피는 파이프라인과 유사하게 순서, 건너뛰기, 필요한 인풋, 아웃풋 등이 적혀있다.

  1. 재료손질(샀을때 이미손질되어있으면 안해도됨)
  2. 요리
      1. 국
      2. 볶음밥
  3. 상차리기

      ![recipe.jpg](https://lcc3108.github.io/img/2021/01/08/Untitled_Diagram_(1).jpg)
</details>

## 설치

### pipeline

둘중 하나를 선택해서 설치

#### cli

```bash
kubectl apply --filename https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
```

#### OLM을 통한 operator 설치 

[OLM을 통한 operator 설치 ](https://operatorhub.io/operator/tektoncd-operator)

### Dashboard

GUI를 통해 생성, 결과확인 등이 가능하므로 설치하는걸 추천한다.

tekton dashboard, okd-console 택 1 설치

#### tekton dashboard

```bash
kubectl apply --filename https://storage.googleapis.com/tekton-releases/dashboard/latest/tekton-dashboard-release.yaml
```

#### okd-console
태스크런이나 파이프라인런 생성시 params, workspace 지정이 편하다.
[블로그 okd-console 글](https://lcc3108.github.io/articles/2021-01/operator-OLM-OKD-console#okd-console)

## Task

태스크는 스탭 집합의 순차적인 처리방법에 대한 정의이다.

태스크는(프로그램) 정의이기때문에 실행시키기위해선 태스크런을(프로세스 통해 인스턴스화가 가능하다.

태스크당 한 개의 팟이 생성되며 스텝당 컨테이너가 들어가게 된다. 때문에 같은 태스크에 있으면 디렉토리를 공유할 수 있다.

태스크는 네임스페이스에 종속되어있는 태스크와 클러스터에 종속되는 클러스터태스크가 있다.

태스크는 네임스페이가 다르면 참조할 수 없지만 클러스터 태스크는 어디에서나 참조 가능하다.

마치 쿠버네티스에서 롤과 클러스터롤과 같다.

### 예시

파라미터를 받아 출력하는 스탭을 가지고있는 태스크이다.

```bash
kubectl apply -f - <<\EOF
apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: echo-params
spec:
  params:
  - name: input-string
    type: string
    default: Hello World #기본값 지정
  steps:
    - name: echo
      image: ubuntu
      command:
        - echo
      args:
        - $(params.input-string)
EOF
```

실행시키기 위해서 태스크런을 생성해준다.

```bash
kubectl apply -f - <<EOF
apiVersion: tekton.dev/v1beta1
kind: TaskRun
metadata:
  name: echo-params-task-run
spec:
  taskRef:
    name: echo-params
EOF
```

대시보드에서 결과 확인

![echo-result.png](https://lcc3108.github.io/img/2021/01/08/Untitled.png)

파라미터를 줘서 실행시켜보자

```bash
kubectl apply -f - <<EOF
apiVersion: tekton.dev/v1beta1
kind: TaskRun
metadata:
  name: echo-params-task-run2
spec:
  params:
  - name: input-string #(태스크의 params.name과 일치해야함)
    value: params test
  taskRef:
    name: echo-params
EOF
```

params test가 출력된걸 확인할 수 있다.

![echo-param.png](https://lcc3108.github.io/img/2021/01/08/Untitled%201.png)

## Pipeline

파이프라인은 태스크 집합의 처리방법에 대한 정의이다. 

태스크는 스텝을 순차적으로 처리하지만 파이프라인은 상관관계를 표현하여 병렬, 상관관계등 순서를 지정할 수 있다.

파이프라인은 태스크에서 사용할 파라미터, 리소스, 워크스페이스 등을 구성할 수 있다.

### 예시

파일에 값을 쓰는 태스크와 파일에 값을 읽는 태스크를 예시로 파이프라인을 사용해보자

태스크간 파일 공유를 위해 워크스페이스를 지정해줬다.

태스크에서 workspaces항목은 파이프라인에서 주는 값에 별명이다.

즉 이름이 달라도 파이프라인에서 같은 값을 할당해주면 같은곳을 바라보게 된다.

다만 emptyDir의 경우 팟에 종속되기때문에 태스크별 파일공유가 불가능하다.

태스크들

```bash
kubectl apply -f - <<\EOF
apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: write-file
spec:
  steps:
    - name: write
      image: alpine
      script: |
        echo hello! > $(workspaces.name-in-task1.path)/message
  workspaces:
  - name: name-in-task1
---
apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: read-file
spec:
  steps:
    - name: read
      image: alpine
      script: |
        cat $(workspaces.name-in-task2.path)/message
  workspaces:
  - name: name-in-task2
EOF
```

파이프라인

만약 runAfter가 없으면 두개의 태스크가 동시에 실행된다.

```bash
kubectl apply -f - <<EOF
apiVersion: tekton.dev/v1alpha1
kind: Pipeline
metadata:
  name: use-workspace-pipeline
spec:
  workspaces:
    - name: my-ws1
  tasks:
    - name: write-ws-file
      taskRef:
        name: write-file 
      workspaces:
        - name: name-in-task1 # write-file 태스크의 워크스페이스와 동일해야함
          workspace: my-ws1
    - name: read-file
      taskRef:
        name: read-file 
      runAfter:
        - write-ws-file # write-ws-file 실행 후에 read-file 실행
      workspaces:
        - name: name-in-task2
          workspace: my-ws1
EOF
```

PVC(storageclass hostpath 사용시 pvc생성시 hostpath매핑)

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: task-pv-claim
spec:
  storageClassName: "hostpath"
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Mi
EOF
```

실행

```bash
kubectl apply -f - <<EOF
apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  name: use-workspace-pipeline-run
  labels:
    tekton.dev/pipeline: use-workspace-pipeline
spec:
  pipelineRef:
    name: use-workspace-pipeline
  workspaces:
    - name: my-ws1
      persistentVolumeClaim:
        claimName: task-pv-claim
EOF
```


---

## 참고 URL

- [공식 튜토리얼](https://github.com/tektoncd/pipeline/blob/master/docs/tutorial.md#creating-and-running-a-pipeline)
- [공식 문서](https://tekton.dev/docs/)