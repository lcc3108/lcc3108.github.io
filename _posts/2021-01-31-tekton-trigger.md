---
layout: post
title: Tekton Trigger 소개
categories: [Tekton]
tags: [Tekton]
comments: true
---


- [개요](#개요)
- [설치](#설치)
- [Event Linster + Trigger](#event-linster--trigger)
- [TriggerBinding](#triggerbinding)
- [Trigger Template](#trigger-template)


# 개요

이전 포스트에서는 실제 작업이 일어나는 tekton pipeline을 다뤘다.

이번 포스트에서는 해당 파이프라인을 실행시키는 tekton trigger에 대해 설명한다.

파이프라인을 사용하면 컨테이너에서 해야할 작업을 명시할 수 있지만 해당 작업을 실행 시키기위해서 직접 runs 엔티티를 만들어줘야한다.

트리거를 사용하면 웹훅을 통해 파이프라인 실행을 할 수 있다.

![tekton-tigger-icon](https://lcc3108.github.io/img/2021/01/31/tekton-trigger.png)

| 이름             | 설명                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Trigger          | 웹훅 이벤트에 대해 검증, 파싱 로직을 실행시킨뒤 트리거 템플릿과 트리거 바인딩을 연결시켜준다.         |
| Trigger Template | 이벤트리스너에서 어떠한 파라미터를 받을지에대한 정의와 어떤 파이프라인 엔티티를  사용할지를 정의한다. |
| Trigger Binding  | 이벤트리스너에서 받은데이터를 트리거템플릿의 파라미터와 매핑시켜준다.                                 |
| Event Linster    | 웹훅 이벤트 리스너를 서비스로 노출시키며 이벤트를 트리거로 전달한다.                                  |

                         

# 설치

텍톤 트리거의 설치 및 사용을 위해선 텍톤 파이프라인 설치가 필요하다.

파이프라인 설치

```bash
kubectl apply --filename https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
```

트리거 설치

```bash
kubectl apply --filename https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
```

검증

```bash
$ kubectl get pods --namespace tekton-pipelines
NAME                                           READY   STATUS    RESTARTS   AGE
tekton-pipelines-controller-5cdb46974f-qzk76   1/1     Running   1          16d
tekton-pipelines-webhook-6479d769ff-sfs2m      1/1     Running   1          16d
tekton-triggers-controller-5994f6c94b-2fvjv    1/1     Running   1          16d
tekton-triggers-webhook-68c7866d8-lrnzv        1/1     Running   1          16d
```

# Event Linster + Trigger

이벤트 리스너는 HTTP기반으로 동작하며 JSON payload를 받는다.

받은 웹훅을 트리거를 통해 검증, 파싱하며 트리거 바인딩을 통해 파싱된 값으로 트리거 템플릿을 실행시킨다.

인터셉터(Interceptors)를 통해 들어온 웹훅을 받아들일지 정하는 필터를 지정하거나 웹훅의 페이로드를 수정할 수 있다.

- serviceAccountName : github, docker 등 인증정보를 가지고있는 서비스어카운트
- triggers : triggerRef을 통한 트리거 참고 혹은 나머지를 사용한 인라인 트리거 정의가 있다
    - name : 이름
    - interceptors: 웹훅 요청을 가로채서 검증과 덮어쓰기등 작업을한다.
        - filter: filter의 결과가 true면 실행 false면 실행하지않고 다음트리거 호출
    - bindings: 트리거 바인딩에 대한 참조
    - template: 트리거 템플릿에 대한참조
    - triggerRef: 위의 모든 정보를 가지고있는 트리거를 참조

필자가 사용중인 아래의 이벤트리스너는 깃허브에서 push와 특정라벨이 있는 풀리퀘스트에 대해 동작한다.

```yaml
apiVersion: triggers.tekton.dev/v1alpha1      
kind: EventListener
metadata:
  name: gitops-el
  namespace: tekton
spec:
  serviceAccountName: builder-bot # github, harbor 인증관련 시크릿을 가지고있는 SA
  triggers:
  - name: github-push
    interceptors:
    - github:
        eventTypes:
          - push
    - cel:
        filter: |
          body.ref.split('/')[2] in ['master', 'main', 'develop', 'release']
        overlays:
        - key: sha
          expression: |
            body.head_commit.id
        - key: short_sha
          expression: |
            body.head_commit.id.truncate(7)
        - key: branch_name
          expression: |
            body.ref.split('/')[2]
        - key: deploy_env
          expression: |
            {"master": "prod", "main": "prod", "develop": "dev", "release": "staging"}[string(body.ref.split('/')[2])]
        - key: docker_project
          expression: |
            {"master": "live", "main":  "live", "develop":  "develop", "release":  "develop"}[string(body.ref.split('/')[2])]
    bindings:
    - ref: gitops-add-tb
    template:
      ref: gitops-add-tt
  - name: pull-request-open
    interceptors:
    - github:
        eventTypes:
          - pull_request
    - cel:
        filter: |
          body.action in ['opened', 'synchronize', 'reopened', 'labeled'] && body.pull_request.labels.exists(k, k.name=='deploy')
        overlays:
        - key: sha
          expression: |
            body.pull_request.head.sha
        - key: short_sha
          expression: |
            body.pull_request.head.sha.truncate(7)
        - key: branch_name
          expression: |
            body.pull_request.head.ref
        - key: deploy_env
          expression: |
            'pr-' + string(body.pull_request.number)
        - key: docker_project
          expression: |
            "pr"
    bindings:
    - ref: gitops-add-tb
    template:
      ref: gitops-add-tt
  - name: pull-request-close
    interceptors:
    - github:
        eventTypes:
          - pull_request
    - cel:
        filter: |
          body.action == 'closed' || (body.action == 'unlabeled' && body.label.name == 'deploy')
        overlays:
        - key: deploy_env
          expression: |
            'pr-' + string(body.pull_request.number)
    bindings:
    - ref: gitops-delete-tb
    template:
      ref: gitops-delete-tt
```

첫번째 github-push 트리거의 형우 깃허브와 cel 인터셉터를 가지고있다.

github-push 트리거의 깃허브 인터셉터는 filter로 이벤트타입이 push만 받는다고 명시하고있다.

두번째는 CEL이라는 인터셉터인데 [CEL](https://github.com/google/cel-spec)(Common Expression Language)은 구글이 오픈소스로 공개한 텍스트에 대한 쿼리언어이다.


filter에서 'body.ref.split('/')[2]' 라는 표현식을 사용하는데 이는 body(map)에 ref(string)라는 필드의 값을 split('/')(function) / 로 나눠서 배열로반환한다.

즉 refs/heads/master 이렇게 데이터가 왔다면 body.ref.split('/')[2] 의 결과는 ["refs", "heads", "master" ][2]가 된다. 즉 배열의 3번째인 master가 파싱된다.

![trigger-example.png](https://lcc3108.github.io/img/2021/01/31/tekton-example.png)

<center> 자바스크립트를 통한 예시 </center>

overay는 json으로 들어온 데이터를 expression 파싱한 값을 key-value로 바디에 저장한다. sha의 경우 접근시 $(extensions.sha) 를 통해 접근이 가능하다.

# TriggerBinding

트리거 바인딩은 이벤트리스너 → 트리거로 파싱된 데이터를 트리거 템플릿과 매핑시켜준다.

원래 바디에 있는 값은 $(body.\*)로 접근이 가능하고 CEL을 사용하여 파싱한경우 $(extensions.\*)로 접근이 가능하다.

```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: TriggerBinding
metadata:
  name: gitops-add-tb
  namespace: tekton
spec:
  params:
  - name: git-repo-url
    value: $(body.repository.html_url)
  - name: git-repo-name
    value: $(body.repository.name)
  - name: git-branch
    value: $(extensions.branch_name)
  - name: git-sha
    value: $(extensions.sha)
  - name: git-short-sha
    value: $(extensions.short_sha)
  - name: deploy-env
    value: $(extensions.deploy_env)
  - name: docker_project
    value: $(extensions.docker_project)
```

# Trigger Template

트리거 템플릿은 트리거 바인딩으로부터 파라미터를 받아 적절한 파이프라인 엔티티를 실행시키는 역할을 한다.

파이프라인 엔티티는 태스크(런), 파이프라인(런), 파이프라인 리소스등을 템플릿화 시킬 수 있다.

트리거 템플릿의 파라미터에 접근할떄는 $(tt.params.\*)로 접근한다.

```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: TriggerTemplate
metadata:
  name: gitops-add-tt
  namespace: tekton
  annotations:
    tekton.dev/eventlistener: gitops-el
spec:
  params: 
  - name: git-repo-url
  - name: git-repo-name
  - name: git-branch
  - name: git-sha
  - name: git-short-sha
  - name: deploy-env
  - name: docker_project
  resourcetemplates:
  - apiVersion: tekton.dev/v1alpha1
    kind: PipelineResource
    metadata:
      name: git-$(tt.params.git-repo-name)-$(uid)
    spec:
      params:
      - name: name
        value: $(tt.params.git-repo-name)
      - name: url
        value: $(tt.params.git-repo-url)
      - name: revision
        value: $(tt.params.git-sha)
      type: git
  - apiVersion: tekton.dev/v1alpha1
    kind: PipelineResource
    metadata:
      name: image-$(tt.params.git-repo-name)-$(uid)
    spec:
      params:
      - name: name
        value: $(tt.params.git-repo-name)
      - name: tag
        value: $(tt.params.git-short-sha)
      - name: url
        value: {{ $.Values.dockerRepo.url  }}/$(tt.params.docker_project)/$(tt.params.git-repo-name):$(tt.params.git-short-sha)
      type: image
  - apiVersion: tekton.dev/v1alpha1
    kind: PipelineRun
    metadata:
      generateName: run-$(tt.params.git-repo-name)-$(uid)-
    spec:
      workspaces:
      - name: docker-cache
        persistentVolumeClaim:
          claimName: tekton-docker-cache
      params:
      - name: app-name
        value: $(tt.params.git-repo-name)
      - name: git-sha
        value: $(tt.params.git-sha)
      - name: git-branch
        value: $(tt.params.git-branch)
      - name: deploy-env
        value: $(tt.params.deploy-env)
      - name: git-short-sha
        value: $(tt.params.git-short-sha)
      - name: git-repo-url
        value: $(tt.params.git-repo-url)
      - name: docker_project
        value: $(tt.params.docker_project)
      pipelineRef:
        name: gitops-add-pp
      resources:
      - name: app-source
        resourceRef:
          name: git-$(tt.params.git-repo-name)-$(uid)
      - name: app-image
        resourceRef:
          name: image-$(tt.params.git-repo-name)-$(uid)
      serviceAccountName: {{ .Values.serviceAccount.name }}
```