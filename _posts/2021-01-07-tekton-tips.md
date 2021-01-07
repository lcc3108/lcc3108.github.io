---
layout: post
title: tekton tips
categories: [Tekton]
tags: [Tekton]
comments: true
---
tekton을 사용하면서 구글링을 해봐도 잘 나오지 않고 심지어 공식홈페이지 문서도 업데이트가 느리기때문에 빠르게 공유를 위해 포스팅한다.

2021-01-07일 기준

| 이름  |  최신버전 | 문서버전  |
|---|---|---|
|  Triggers | v0.10.2  |  v0.9.1 |
|  Pipelines |  v0.19.0 |  v0.18.1 |


## TriggerTemplate

TriggerTemplate params에 접근 할때 tt.paprams로 접근해야한다.

```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: TriggerTemplate
metadata:
  name: trigger-template
spec:
  params: 
  - name: git-repo-url
  - name: git-repo-name
  - name: git-revision
  - name: git-branch
  - name: deploy-env
  resourcetemplates:
  - apiVersion: tekton.dev/v1alpha1
    kind: PipelineResource
    metadata:
      name: git-$(tt.params.git-repo-name)-$(uid)
    spec:
      params:
      - name: url
        value: $(tt.params.git-repo-url)
      - name: revision
        value: $(tt.params.git-revision)
      - name: git-repo-name
        value: $(tt.params.git-repo-name)
      type: git
  - apiVersion: tekton.dev/v1alpha1
    kind: PipelineResource
    metadata:
      name: image-$(tt.params.git-repo-name)-$(uid)
    spec:
      params:
      - name: url
        value: {{ .Values.config.dockerRepo.url }}/$(tt.params.git-repo-name):$(tt.params.git-revision)
      type: image
  - apiVersion: tekton.dev/v1alpha1
    kind: PipelineRun
    metadata:
      generateName: run-$(tt.params.git-repo-name)-$(uid)-
    spec:
      params:
      - name: app-name
        value: $(tt.params.git-repo-name)
      - name: git-revision
        value: $(tt.params.git-revision)
      - name: git-branch
        value: $(tt.params.git-branch)
      - name: deploy-env
        value: $(tt.params.deploy-env)
      pipelineRef:
        name: pipeline
      resources:
      - name: app-source
        resourceRef:
          name: git-$(tt.params.git-repo-name)-$(uid)
      - name: app-image
        resourceRef:
          name: image-$(tt.params.git-repo-name)-$(uid)
      serviceAccountName: {{ .Values.config.serviceAccount.name }}
```

## EventListener

0.10 버전 이상부터는 interceptors.*.overlays 시 body나 head를 덮어쓸 수 없음


참고: [tektoncd/community](https://github.com/tektoncd/community/blob/master/teps/0022-trigger-immutable-input.md)

에러발생 예시(body가 불변객체로 변경되어서 값을 넣을 수 없다)
```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: EventListener
metadata:
  name: event-listener
spec:
  serviceAccountName: {{ .Values.config.serviceAccount.name }}
  triggers:
  - name: master
    interceptors:
      - cel:
          filter: |
            body.ref.split('/')[2] == 'master'
          overlays:
          - key: body.short_sha 
            expression: |
             "body.head_commit.id.truncate(7)"
          - key: body.branch_name
            expression: |
            "body.ref.split('/')[2]"
          - key: body.deploy_env
            expression: |
            '''prod'''
    bindings:
    - ref: trigger-binding
    template:
      ref: trigger-template
---
apiVersion: triggers.tekton.dev/v1alpha1
kind: TriggerBinding
metadata:
  name: trigger-binding
spec:
  params:
  - name: git-repo-url
    value: $(body.repository.url)
  - name: git-revision
    value: $(body.head_commit.id)
  - name: git-repo-name
    value: $(body.repository.name)
  - name: git-branch
    value: $(body.branch_name)
  - name: deploy-env
    value: $(body.deploy_env)
```

수정(extensions 사용)
```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: EventListener
metadata:
  name: event-listener
spec:
  serviceAccountName: {{ .Values.config.serviceAccount.name }}
  triggers:
  - name: master
    interceptors:
      - cel:
          filter: |
            body.ref.split('/')[2] == 'master'
          overlays:
          - key: short_sha # $(extensions.short_sha) 로 접근가능
            expression: |
             "body.head_commit.id.truncate(7)"
          - key: branch_name
            expression: |
            "body.ref.split('/')[2]"
          - key: deploy_env
            expression: |
            '''prod'''
    bindings:
    - ref: trigger-binding
    template:
      ref: trigger-template
---
apiVersion: triggers.tekton.dev/v1alpha1
kind: TriggerBinding
metadata:
  name: trigger-binding
spec:
  params:
  - name: git-repo-url
    value: $(body.repository.url)
  - name: git-revision
    value: $(body.head_commit.id)
  - name: git-repo-name
    value: $(body.repository.name)
  - name: git-branch
    value: $(extensions.branch_name)
  - name: deploy-env
    value: $(extensions.deploy_env)
```