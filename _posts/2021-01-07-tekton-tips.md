---
layout: post
title: tekton tips
categories: [Tekton]
tags: [Tekton]
comments: true
---

- [TriggerTemplate](#triggertemplate)
- [EventListener](#eventlistener)
  - [common Expression Language(CEL)](#common-expression-languagecel)
    - [푸쉬](#푸쉬)
    - [풀리퀘스트](#풀리퀘스트)

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
2021-01-20 추가
### common Expression Language(CEL) 
이벤트 리스너에서 interceptors에 CEL을 사용할 수 있다.
깃허브 푸쉬와 풀리퀘스트 웹훅을 예시로 들어보겠다.

#### 푸쉬

master, main 브랜치에 푸쉬될때만 작동하는 이벤트리스너 예시이다.


<details markdown="1">
<summary> 깃허브 웹훅 예시</summary>

```json
{
  "ref": "refs/tags/simple-tag",
  "before": "6113728f27ae82c7b1a177c8d03f9e96e0adf246",
  "after": "0000000000000000000000000000000000000000",
  "created": false,
  "deleted": true,
  "forced": false,
  "base_ref": null,
  "compare": "https://github.com/Codertocat/Hello-World/compare/6113728f27ae...000000000000",
  "commits": [],
  "head_commit": null,
  "repository": {
    "id": 186853002,
    "node_id": "MDEwOlJlcG9zaXRvcnkxODY4NTMwMDI=",
    "name": "Hello-World",
    "full_name": "Codertocat/Hello-World",
    "private": false,
    "owner": {
      "name": "Codertocat",
      "email": "21031067+Codertocat@users.noreply.github.com",
      "login": "Codertocat",
      "id": 21031067,
      "node_id": "MDQ6VXNlcjIxMDMxMDY3",
      "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
      "gravatar_id": "",
      "url": "https://api.github.com/users/Codertocat",
      "html_url": "https://github.com/Codertocat",
      "followers_url": "https://api.github.com/users/Codertocat/followers",
      "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
      "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
      "organizations_url": "https://api.github.com/users/Codertocat/orgs",
      "repos_url": "https://api.github.com/users/Codertocat/repos",
      "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
      "received_events_url": "https://api.github.com/users/Codertocat/received_events",
      "type": "User",
      "site_admin": false
    },
    "html_url": "https://github.com/Codertocat/Hello-World",
    "description": null,
    "fork": false,
    "url": "https://github.com/Codertocat/Hello-World",
    "forks_url": "https://api.github.com/repos/Codertocat/Hello-World/forks",
    "keys_url": "https://api.github.com/repos/Codertocat/Hello-World/keys{/key_id}",
    "collaborators_url": "https://api.github.com/repos/Codertocat/Hello-World/collaborators{/collaborator}",
    "teams_url": "https://api.github.com/repos/Codertocat/Hello-World/teams",
    "hooks_url": "https://api.github.com/repos/Codertocat/Hello-World/hooks",
    "issue_events_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/events{/number}",
    "events_url": "https://api.github.com/repos/Codertocat/Hello-World/events",
    "assignees_url": "https://api.github.com/repos/Codertocat/Hello-World/assignees{/user}",
    "branches_url": "https://api.github.com/repos/Codertocat/Hello-World/branches{/branch}",
    "tags_url": "https://api.github.com/repos/Codertocat/Hello-World/tags",
    "blobs_url": "https://api.github.com/repos/Codertocat/Hello-World/git/blobs{/sha}",
    "git_tags_url": "https://api.github.com/repos/Codertocat/Hello-World/git/tags{/sha}",
    "git_refs_url": "https://api.github.com/repos/Codertocat/Hello-World/git/refs{/sha}",
    "trees_url": "https://api.github.com/repos/Codertocat/Hello-World/git/trees{/sha}",
    "statuses_url": "https://api.github.com/repos/Codertocat/Hello-World/statuses/{sha}",
    "languages_url": "https://api.github.com/repos/Codertocat/Hello-World/languages",
    "stargazers_url": "https://api.github.com/repos/Codertocat/Hello-World/stargazers",
    "contributors_url": "https://api.github.com/repos/Codertocat/Hello-World/contributors",
    "subscribers_url": "https://api.github.com/repos/Codertocat/Hello-World/subscribers",
    "subscription_url": "https://api.github.com/repos/Codertocat/Hello-World/subscription",
    "commits_url": "https://api.github.com/repos/Codertocat/Hello-World/commits{/sha}",
    "git_commits_url": "https://api.github.com/repos/Codertocat/Hello-World/git/commits{/sha}",
    "comments_url": "https://api.github.com/repos/Codertocat/Hello-World/comments{/number}",
    "issue_comment_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/comments{/number}",
    "contents_url": "https://api.github.com/repos/Codertocat/Hello-World/contents/{+path}",
    "compare_url": "https://api.github.com/repos/Codertocat/Hello-World/compare/{base}...{head}",
    "merges_url": "https://api.github.com/repos/Codertocat/Hello-World/merges",
    "archive_url": "https://api.github.com/repos/Codertocat/Hello-World/{archive_format}{/ref}",
    "downloads_url": "https://api.github.com/repos/Codertocat/Hello-World/downloads",
    "issues_url": "https://api.github.com/repos/Codertocat/Hello-World/issues{/number}",
    "pulls_url": "https://api.github.com/repos/Codertocat/Hello-World/pulls{/number}",
    "milestones_url": "https://api.github.com/repos/Codertocat/Hello-World/milestones{/number}",
    "notifications_url": "https://api.github.com/repos/Codertocat/Hello-World/notifications{?since,all,participating}",
    "labels_url": "https://api.github.com/repos/Codertocat/Hello-World/labels{/name}",
    "releases_url": "https://api.github.com/repos/Codertocat/Hello-World/releases{/id}",
    "deployments_url": "https://api.github.com/repos/Codertocat/Hello-World/deployments",
    "created_at": 1557933565,
    "updated_at": "2019-05-15T15:20:41Z",
    "pushed_at": 1557933657,
    "git_url": "git://github.com/Codertocat/Hello-World.git",
    "ssh_url": "git@github.com:Codertocat/Hello-World.git",
    "clone_url": "https://github.com/Codertocat/Hello-World.git",
    "svn_url": "https://github.com/Codertocat/Hello-World",
    "homepage": null,
    "size": 0,
    "stargazers_count": 0,
    "watchers_count": 0,
    "language": "Ruby",
    "has_issues": true,
    "has_projects": true,
    "has_downloads": true,
    "has_wiki": true,
    "has_pages": true,
    "forks_count": 1,
    "mirror_url": null,
    "archived": false,
    "disabled": false,
    "open_issues_count": 2,
    "license": null,
    "forks": 1,
    "open_issues": 2,
    "watchers": 0,
    "default_branch": "master",
    "stargazers": 0,
    "master_branch": "master"
  },
  "pusher": {
    "name": "Codertocat",
    "email": "21031067+Codertocat@users.noreply.github.com"
  },
  "sender": {
    "login": "Codertocat",
    "id": 21031067,
    "node_id": "MDQ6VXNlcjIxMDMxMDY3",
    "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
    "gravatar_id": "",
    "url": "https://api.github.com/users/Codertocat",
    "html_url": "https://github.com/Codertocat",
    "followers_url": "https://api.github.com/users/Codertocat/followers",
    "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
    "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
    "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
    "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
    "organizations_url": "https://api.github.com/users/Codertocat/orgs",
    "repos_url": "https://api.github.com/users/Codertocat/repos",
    "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
    "received_events_url": "https://api.github.com/users/Codertocat/received_events",
    "type": "User",
    "site_admin": false
  }
}
```
</details>


아래 예시는 github에서 webhook의 push이벤트만 받으며
body.ref를 파싱하여 'master', 'main' 이 포함되어있는 웹훅만 받는다.

sha와 short_sha, branch_name 을 파싱한다.
```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: EventListener
metadata:
  name: event-listener
spec:
  triggers:
  - name: master
    interceptors:
    - github:
        eventTypes:
          - push
    - cel:
        filter: |
          body.ref.split('/')[2] in ['master', 'main'] # string을 지정된 문자로 나누어 배열로 리턴
        overlays:
        - key: sha
          expression: |
            body.head_commit.id
        - key: short_sha
          expression: |
            body.head_commit.id.truncate(7) #truncate는 글자를 앞에서부터 잘라주는 함수
        - key: branch_name
          expression: |
            body.ref.split('/')[2]
#... 생략
```

#### 풀리퀘스트

deploy 라벨이 달린 풀리퀘에만 특정작업을 하는 이벤트 리스너이다.

<details markdown="1">
<summary> 풀리퀘스트 웹훅 예시</summary>

```json
{
  "action": "opened",
  "number": 2,
  "pull_request": {
    "url": "https://api.github.com/repos/Codertocat/Hello-World/pulls/2",
    "id": 279147437,
    "node_id": "MDExOlB1bGxSZXF1ZXN0Mjc5MTQ3NDM3",
    "html_url": "https://github.com/Codertocat/Hello-World/pull/2",
    "diff_url": "https://github.com/Codertocat/Hello-World/pull/2.diff",
    "patch_url": "https://github.com/Codertocat/Hello-World/pull/2.patch",
    "issue_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/2",
    "number": 2,
    "state": "open",
    "locked": false,
    "title": "Update the README with new information.",
    "user": {
      "login": "Codertocat",
      "id": 21031067,
      "node_id": "MDQ6VXNlcjIxMDMxMDY3",
      "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
      "gravatar_id": "",
      "url": "https://api.github.com/users/Codertocat",
      "html_url": "https://github.com/Codertocat",
      "followers_url": "https://api.github.com/users/Codertocat/followers",
      "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
      "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
      "organizations_url": "https://api.github.com/users/Codertocat/orgs",
      "repos_url": "https://api.github.com/users/Codertocat/repos",
      "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
      "received_events_url": "https://api.github.com/users/Codertocat/received_events",
      "type": "User",
      "site_admin": false
    },
    "body": "This is a pretty simple change that we need to pull into master.",
    "created_at": "2019-05-15T15:20:33Z",
    "updated_at": "2019-05-15T15:20:33Z",
    "closed_at": null,
    "merged_at": null,
    "merge_commit_sha": null,
    "assignee": null,
    "assignees": [],
    "requested_reviewers": [],
    "requested_teams": [],
    "labels": [
      {
        "id": 2214774012,
        "node_id": "MDU6TGFiZWwyMjE0Nzc0MDEy",
        "url": "https://api.github.com/repos/Codertocat/Hello-World/labels/dependencies",
        "name": "dependencies",
        "color": "0366d6",
        "default": false,
        "description": "Pull requests that update a dependency file"
      },
      {
        "id": 2672583269,
        "node_id": "MDU6TGFiZWwyNjcyNTgzMjY5",
        "url": "https://api.github.com/repos/Codertocat/Hello-World/labels/deploy",
        "name": "deploy",
        "color": "3D0C91",
        "default": false,
        "description": ""
      }
    ],
    "milestone": null,
    "commits_url": "https://api.github.com/repos/Codertocat/Hello-World/pulls/2/commits",
    "review_comments_url": "https://api.github.com/repos/Codertocat/Hello-World/pulls/2/comments",
    "review_comment_url": "https://api.github.com/repos/Codertocat/Hello-World/pulls/comments{/number}",
    "comments_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/2/comments",
    "statuses_url": "https://api.github.com/repos/Codertocat/Hello-World/statuses/ec26c3e57ca3a959ca5aad62de7213c562f8c821",
    "head": {
      "label": "Codertocat:changes",
      "ref": "changes",
      "sha": "ec26c3e57ca3a959ca5aad62de7213c562f8c821",
      "user": {
        "login": "Codertocat",
        "id": 21031067,
        "node_id": "MDQ6VXNlcjIxMDMxMDY3",
        "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
        "gravatar_id": "",
        "url": "https://api.github.com/users/Codertocat",
        "html_url": "https://github.com/Codertocat",
        "followers_url": "https://api.github.com/users/Codertocat/followers",
        "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
        "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
        "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
        "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
        "organizations_url": "https://api.github.com/users/Codertocat/orgs",
        "repos_url": "https://api.github.com/users/Codertocat/repos",
        "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
        "received_events_url": "https://api.github.com/users/Codertocat/received_events",
        "type": "User",
        "site_admin": false
      },
      "repo": {
        "id": 186853002,
        "node_id": "MDEwOlJlcG9zaXRvcnkxODY4NTMwMDI=",
        "name": "Hello-World",
        "full_name": "Codertocat/Hello-World",
        "private": false,
        "owner": {
          "login": "Codertocat",
          "id": 21031067,
          "node_id": "MDQ6VXNlcjIxMDMxMDY3",
          "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
          "gravatar_id": "",
          "url": "https://api.github.com/users/Codertocat",
          "html_url": "https://github.com/Codertocat",
          "followers_url": "https://api.github.com/users/Codertocat/followers",
          "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
          "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
          "organizations_url": "https://api.github.com/users/Codertocat/orgs",
          "repos_url": "https://api.github.com/users/Codertocat/repos",
          "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
          "received_events_url": "https://api.github.com/users/Codertocat/received_events",
          "type": "User",
          "site_admin": false
        },
        "html_url": "https://github.com/Codertocat/Hello-World",
        "description": null,
        "fork": false,
        "url": "https://api.github.com/repos/Codertocat/Hello-World",
        "forks_url": "https://api.github.com/repos/Codertocat/Hello-World/forks",
        "keys_url": "https://api.github.com/repos/Codertocat/Hello-World/keys{/key_id}",
        "collaborators_url": "https://api.github.com/repos/Codertocat/Hello-World/collaborators{/collaborator}",
        "teams_url": "https://api.github.com/repos/Codertocat/Hello-World/teams",
        "hooks_url": "https://api.github.com/repos/Codertocat/Hello-World/hooks",
        "issue_events_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/events{/number}",
        "events_url": "https://api.github.com/repos/Codertocat/Hello-World/events",
        "assignees_url": "https://api.github.com/repos/Codertocat/Hello-World/assignees{/user}",
        "branches_url": "https://api.github.com/repos/Codertocat/Hello-World/branches{/branch}",
        "tags_url": "https://api.github.com/repos/Codertocat/Hello-World/tags",
        "blobs_url": "https://api.github.com/repos/Codertocat/Hello-World/git/blobs{/sha}",
        "git_tags_url": "https://api.github.com/repos/Codertocat/Hello-World/git/tags{/sha}",
        "git_refs_url": "https://api.github.com/repos/Codertocat/Hello-World/git/refs{/sha}",
        "trees_url": "https://api.github.com/repos/Codertocat/Hello-World/git/trees{/sha}",
        "statuses_url": "https://api.github.com/repos/Codertocat/Hello-World/statuses/{sha}",
        "languages_url": "https://api.github.com/repos/Codertocat/Hello-World/languages",
        "stargazers_url": "https://api.github.com/repos/Codertocat/Hello-World/stargazers",
        "contributors_url": "https://api.github.com/repos/Codertocat/Hello-World/contributors",
        "subscribers_url": "https://api.github.com/repos/Codertocat/Hello-World/subscribers",
        "subscription_url": "https://api.github.com/repos/Codertocat/Hello-World/subscription",
        "commits_url": "https://api.github.com/repos/Codertocat/Hello-World/commits{/sha}",
        "git_commits_url": "https://api.github.com/repos/Codertocat/Hello-World/git/commits{/sha}",
        "comments_url": "https://api.github.com/repos/Codertocat/Hello-World/comments{/number}",
        "issue_comment_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/comments{/number}",
        "contents_url": "https://api.github.com/repos/Codertocat/Hello-World/contents/{+path}",
        "compare_url": "https://api.github.com/repos/Codertocat/Hello-World/compare/{base}...{head}",
        "merges_url": "https://api.github.com/repos/Codertocat/Hello-World/merges",
        "archive_url": "https://api.github.com/repos/Codertocat/Hello-World/{archive_format}{/ref}",
        "downloads_url": "https://api.github.com/repos/Codertocat/Hello-World/downloads",
        "issues_url": "https://api.github.com/repos/Codertocat/Hello-World/issues{/number}",
        "pulls_url": "https://api.github.com/repos/Codertocat/Hello-World/pulls{/number}",
        "milestones_url": "https://api.github.com/repos/Codertocat/Hello-World/milestones{/number}",
        "notifications_url": "https://api.github.com/repos/Codertocat/Hello-World/notifications{?since,all,participating}",
        "labels_url": "https://api.github.com/repos/Codertocat/Hello-World/labels{/name}",
        "releases_url": "https://api.github.com/repos/Codertocat/Hello-World/releases{/id}",
        "deployments_url": "https://api.github.com/repos/Codertocat/Hello-World/deployments",
        "created_at": "2019-05-15T15:19:25Z",
        "updated_at": "2019-05-15T15:19:27Z",
        "pushed_at": "2019-05-15T15:20:32Z",
        "git_url": "git://github.com/Codertocat/Hello-World.git",
        "ssh_url": "git@github.com:Codertocat/Hello-World.git",
        "clone_url": "https://github.com/Codertocat/Hello-World.git",
        "svn_url": "https://github.com/Codertocat/Hello-World",
        "homepage": null,
        "size": 0,
        "stargazers_count": 0,
        "watchers_count": 0,
        "language": null,
        "has_issues": true,
        "has_projects": true,
        "has_downloads": true,
        "has_wiki": true,
        "has_pages": true,
        "forks_count": 0,
        "mirror_url": null,
        "archived": false,
        "disabled": false,
        "open_issues_count": 2,
        "license": null,
        "forks": 0,
        "open_issues": 2,
        "watchers": 0,
        "default_branch": "master",
        "allow_squash_merge": true,
        "allow_merge_commit": true,
        "allow_rebase_merge": true,
        "delete_branch_on_merge": false
      }
    },
    "base": {
      "label": "Codertocat:master",
      "ref": "master",
      "sha": "f95f852bd8fca8fcc58a9a2d6c842781e32a215e",
      "user": {
        "login": "Codertocat",
        "id": 21031067,
        "node_id": "MDQ6VXNlcjIxMDMxMDY3",
        "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
        "gravatar_id": "",
        "url": "https://api.github.com/users/Codertocat",
        "html_url": "https://github.com/Codertocat",
        "followers_url": "https://api.github.com/users/Codertocat/followers",
        "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
        "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
        "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
        "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
        "organizations_url": "https://api.github.com/users/Codertocat/orgs",
        "repos_url": "https://api.github.com/users/Codertocat/repos",
        "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
        "received_events_url": "https://api.github.com/users/Codertocat/received_events",
        "type": "User",
        "site_admin": false
      },
      "repo": {
        "id": 186853002,
        "node_id": "MDEwOlJlcG9zaXRvcnkxODY4NTMwMDI=",
        "name": "Hello-World",
        "full_name": "Codertocat/Hello-World",
        "private": false,
        "owner": {
          "login": "Codertocat",
          "id": 21031067,
          "node_id": "MDQ6VXNlcjIxMDMxMDY3",
          "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
          "gravatar_id": "",
          "url": "https://api.github.com/users/Codertocat",
          "html_url": "https://github.com/Codertocat",
          "followers_url": "https://api.github.com/users/Codertocat/followers",
          "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
          "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
          "organizations_url": "https://api.github.com/users/Codertocat/orgs",
          "repos_url": "https://api.github.com/users/Codertocat/repos",
          "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
          "received_events_url": "https://api.github.com/users/Codertocat/received_events",
          "type": "User",
          "site_admin": false
        },
        "html_url": "https://github.com/Codertocat/Hello-World",
        "description": null,
        "fork": false,
        "url": "https://api.github.com/repos/Codertocat/Hello-World",
        "forks_url": "https://api.github.com/repos/Codertocat/Hello-World/forks",
        "keys_url": "https://api.github.com/repos/Codertocat/Hello-World/keys{/key_id}",
        "collaborators_url": "https://api.github.com/repos/Codertocat/Hello-World/collaborators{/collaborator}",
        "teams_url": "https://api.github.com/repos/Codertocat/Hello-World/teams",
        "hooks_url": "https://api.github.com/repos/Codertocat/Hello-World/hooks",
        "issue_events_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/events{/number}",
        "events_url": "https://api.github.com/repos/Codertocat/Hello-World/events",
        "assignees_url": "https://api.github.com/repos/Codertocat/Hello-World/assignees{/user}",
        "branches_url": "https://api.github.com/repos/Codertocat/Hello-World/branches{/branch}",
        "tags_url": "https://api.github.com/repos/Codertocat/Hello-World/tags",
        "blobs_url": "https://api.github.com/repos/Codertocat/Hello-World/git/blobs{/sha}",
        "git_tags_url": "https://api.github.com/repos/Codertocat/Hello-World/git/tags{/sha}",
        "git_refs_url": "https://api.github.com/repos/Codertocat/Hello-World/git/refs{/sha}",
        "trees_url": "https://api.github.com/repos/Codertocat/Hello-World/git/trees{/sha}",
        "statuses_url": "https://api.github.com/repos/Codertocat/Hello-World/statuses/{sha}",
        "languages_url": "https://api.github.com/repos/Codertocat/Hello-World/languages",
        "stargazers_url": "https://api.github.com/repos/Codertocat/Hello-World/stargazers",
        "contributors_url": "https://api.github.com/repos/Codertocat/Hello-World/contributors",
        "subscribers_url": "https://api.github.com/repos/Codertocat/Hello-World/subscribers",
        "subscription_url": "https://api.github.com/repos/Codertocat/Hello-World/subscription",
        "commits_url": "https://api.github.com/repos/Codertocat/Hello-World/commits{/sha}",
        "git_commits_url": "https://api.github.com/repos/Codertocat/Hello-World/git/commits{/sha}",
        "comments_url": "https://api.github.com/repos/Codertocat/Hello-World/comments{/number}",
        "issue_comment_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/comments{/number}",
        "contents_url": "https://api.github.com/repos/Codertocat/Hello-World/contents/{+path}",
        "compare_url": "https://api.github.com/repos/Codertocat/Hello-World/compare/{base}...{head}",
        "merges_url": "https://api.github.com/repos/Codertocat/Hello-World/merges",
        "archive_url": "https://api.github.com/repos/Codertocat/Hello-World/{archive_format}{/ref}",
        "downloads_url": "https://api.github.com/repos/Codertocat/Hello-World/downloads",
        "issues_url": "https://api.github.com/repos/Codertocat/Hello-World/issues{/number}",
        "pulls_url": "https://api.github.com/repos/Codertocat/Hello-World/pulls{/number}",
        "milestones_url": "https://api.github.com/repos/Codertocat/Hello-World/milestones{/number}",
        "notifications_url": "https://api.github.com/repos/Codertocat/Hello-World/notifications{?since,all,participating}",
        "labels_url": "https://api.github.com/repos/Codertocat/Hello-World/labels{/name}",
        "releases_url": "https://api.github.com/repos/Codertocat/Hello-World/releases{/id}",
        "deployments_url": "https://api.github.com/repos/Codertocat/Hello-World/deployments",
        "created_at": "2019-05-15T15:19:25Z",
        "updated_at": "2019-05-15T15:19:27Z",
        "pushed_at": "2019-05-15T15:20:32Z",
        "git_url": "git://github.com/Codertocat/Hello-World.git",
        "ssh_url": "git@github.com:Codertocat/Hello-World.git",
        "clone_url": "https://github.com/Codertocat/Hello-World.git",
        "svn_url": "https://github.com/Codertocat/Hello-World",
        "homepage": null,
        "size": 0,
        "stargazers_count": 0,
        "watchers_count": 0,
        "language": null,
        "has_issues": true,
        "has_projects": true,
        "has_downloads": true,
        "has_wiki": true,
        "has_pages": true,
        "forks_count": 0,
        "mirror_url": null,
        "archived": false,
        "disabled": false,
        "open_issues_count": 2,
        "license": null,
        "forks": 0,
        "open_issues": 2,
        "watchers": 0,
        "default_branch": "master",
        "allow_squash_merge": true,
        "allow_merge_commit": true,
        "allow_rebase_merge": true,
        "delete_branch_on_merge": false
      }
    },
    "_links": {
      "self": {
        "href": "https://api.github.com/repos/Codertocat/Hello-World/pulls/2"
      },
      "html": {
        "href": "https://github.com/Codertocat/Hello-World/pull/2"
      },
      "issue": {
        "href": "https://api.github.com/repos/Codertocat/Hello-World/issues/2"
      },
      "comments": {
        "href": "https://api.github.com/repos/Codertocat/Hello-World/issues/2/comments"
      },
      "review_comments": {
        "href": "https://api.github.com/repos/Codertocat/Hello-World/pulls/2/comments"
      },
      "review_comment": {
        "href": "https://api.github.com/repos/Codertocat/Hello-World/pulls/comments{/number}"
      },
      "commits": {
        "href": "https://api.github.com/repos/Codertocat/Hello-World/pulls/2/commits"
      },
      "statuses": {
        "href": "https://api.github.com/repos/Codertocat/Hello-World/statuses/ec26c3e57ca3a959ca5aad62de7213c562f8c821"
      }
    },
    "author_association": "OWNER",
    "draft": false,
    "merged": false,
    "mergeable": null,
    "rebaseable": null,
    "mergeable_state": "unknown",
    "merged_by": null,
    "comments": 0,
    "review_comments": 0,
    "maintainer_can_modify": false,
    "commits": 1,
    "additions": 1,
    "deletions": 1,
    "changed_files": 1
  },
  "repository": {
    "id": 186853002,
    "node_id": "MDEwOlJlcG9zaXRvcnkxODY4NTMwMDI=",
    "name": "Hello-World",
    "full_name": "Codertocat/Hello-World",
    "private": false,
    "owner": {
      "login": "Codertocat",
      "id": 21031067,
      "node_id": "MDQ6VXNlcjIxMDMxMDY3",
      "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
      "gravatar_id": "",
      "url": "https://api.github.com/users/Codertocat",
      "html_url": "https://github.com/Codertocat",
      "followers_url": "https://api.github.com/users/Codertocat/followers",
      "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
      "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
      "organizations_url": "https://api.github.com/users/Codertocat/orgs",
      "repos_url": "https://api.github.com/users/Codertocat/repos",
      "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
      "received_events_url": "https://api.github.com/users/Codertocat/received_events",
      "type": "User",
      "site_admin": false
    },
    "html_url": "https://github.com/Codertocat/Hello-World",
    "description": null,
    "fork": false,
    "url": "https://api.github.com/repos/Codertocat/Hello-World",
    "forks_url": "https://api.github.com/repos/Codertocat/Hello-World/forks",
    "keys_url": "https://api.github.com/repos/Codertocat/Hello-World/keys{/key_id}",
    "collaborators_url": "https://api.github.com/repos/Codertocat/Hello-World/collaborators{/collaborator}",
    "teams_url": "https://api.github.com/repos/Codertocat/Hello-World/teams",
    "hooks_url": "https://api.github.com/repos/Codertocat/Hello-World/hooks",
    "issue_events_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/events{/number}",
    "events_url": "https://api.github.com/repos/Codertocat/Hello-World/events",
    "assignees_url": "https://api.github.com/repos/Codertocat/Hello-World/assignees{/user}",
    "branches_url": "https://api.github.com/repos/Codertocat/Hello-World/branches{/branch}",
    "tags_url": "https://api.github.com/repos/Codertocat/Hello-World/tags",
    "blobs_url": "https://api.github.com/repos/Codertocat/Hello-World/git/blobs{/sha}",
    "git_tags_url": "https://api.github.com/repos/Codertocat/Hello-World/git/tags{/sha}",
    "git_refs_url": "https://api.github.com/repos/Codertocat/Hello-World/git/refs{/sha}",
    "trees_url": "https://api.github.com/repos/Codertocat/Hello-World/git/trees{/sha}",
    "statuses_url": "https://api.github.com/repos/Codertocat/Hello-World/statuses/{sha}",
    "languages_url": "https://api.github.com/repos/Codertocat/Hello-World/languages",
    "stargazers_url": "https://api.github.com/repos/Codertocat/Hello-World/stargazers",
    "contributors_url": "https://api.github.com/repos/Codertocat/Hello-World/contributors",
    "subscribers_url": "https://api.github.com/repos/Codertocat/Hello-World/subscribers",
    "subscription_url": "https://api.github.com/repos/Codertocat/Hello-World/subscription",
    "commits_url": "https://api.github.com/repos/Codertocat/Hello-World/commits{/sha}",
    "git_commits_url": "https://api.github.com/repos/Codertocat/Hello-World/git/commits{/sha}",
    "comments_url": "https://api.github.com/repos/Codertocat/Hello-World/comments{/number}",
    "issue_comment_url": "https://api.github.com/repos/Codertocat/Hello-World/issues/comments{/number}",
    "contents_url": "https://api.github.com/repos/Codertocat/Hello-World/contents/{+path}",
    "compare_url": "https://api.github.com/repos/Codertocat/Hello-World/compare/{base}...{head}",
    "merges_url": "https://api.github.com/repos/Codertocat/Hello-World/merges",
    "archive_url": "https://api.github.com/repos/Codertocat/Hello-World/{archive_format}{/ref}",
    "downloads_url": "https://api.github.com/repos/Codertocat/Hello-World/downloads",
    "issues_url": "https://api.github.com/repos/Codertocat/Hello-World/issues{/number}",
    "pulls_url": "https://api.github.com/repos/Codertocat/Hello-World/pulls{/number}",
    "milestones_url": "https://api.github.com/repos/Codertocat/Hello-World/milestones{/number}",
    "notifications_url": "https://api.github.com/repos/Codertocat/Hello-World/notifications{?since,all,participating}",
    "labels_url": "https://api.github.com/repos/Codertocat/Hello-World/labels{/name}",
    "releases_url": "https://api.github.com/repos/Codertocat/Hello-World/releases{/id}",
    "deployments_url": "https://api.github.com/repos/Codertocat/Hello-World/deployments",
    "created_at": "2019-05-15T15:19:25Z",
    "updated_at": "2019-05-15T15:19:27Z",
    "pushed_at": "2019-05-15T15:20:32Z",
    "git_url": "git://github.com/Codertocat/Hello-World.git",
    "ssh_url": "git@github.com:Codertocat/Hello-World.git",
    "clone_url": "https://github.com/Codertocat/Hello-World.git",
    "svn_url": "https://github.com/Codertocat/Hello-World",
    "homepage": null,
    "size": 0,
    "stargazers_count": 0,
    "watchers_count": 0,
    "language": null,
    "has_issues": true,
    "has_projects": true,
    "has_downloads": true,
    "has_wiki": true,
    "has_pages": true,
    "forks_count": 0,
    "mirror_url": null,
    "archived": false,
    "disabled": false,
    "open_issues_count": 2,
    "license": null,
    "forks": 0,
    "open_issues": 2,
    "watchers": 0,
    "default_branch": "master"
  },
  "sender": {
    "login": "Codertocat",
    "id": 21031067,
    "node_id": "MDQ6VXNlcjIxMDMxMDY3",
    "avatar_url": "https://avatars1.githubusercontent.com/u/21031067?v=4",
    "gravatar_id": "",
    "url": "https://api.github.com/users/Codertocat",
    "html_url": "https://github.com/Codertocat",
    "followers_url": "https://api.github.com/users/Codertocat/followers",
    "following_url": "https://api.github.com/users/Codertocat/following{/other_user}",
    "gists_url": "https://api.github.com/users/Codertocat/gists{/gist_id}",
    "starred_url": "https://api.github.com/users/Codertocat/starred{/owner}{/repo}",
    "subscriptions_url": "https://api.github.com/users/Codertocat/subscriptions",
    "organizations_url": "https://api.github.com/users/Codertocat/orgs",
    "repos_url": "https://api.github.com/users/Codertocat/repos",
    "events_url": "https://api.github.com/users/Codertocat/events{/privacy}",
    "received_events_url": "https://api.github.com/users/Codertocat/received_events",
    "type": "User",
    "site_admin": false
  }
}
```
</details>

아래의 이벤트 리스너는 pull_request만 받으며 풀리퀘스트의 생성, 동기화, 라벨추가 && 라벨 배열에서 labels[k].name == deploy가 하나라도 존재하는지 찾는 예시이다.
```json
 "labels": [
      {
        "id": 2214774012,
        "node_id": "MDU6TGFiZWwyMjE0Nzc0MDEy",
        "url": "https://api.github.com/repos/Codertocat/Hello-World/labels/dependencies",
        "name": "dependencies",
        "color": "0366d6",
        "default": false,
        "description": "Pull requests that update a dependency file"
      },
      {
        "id": 2672583269,
        "node_id": "MDU6TGFiZWwyNjcyNTgzMjY5",
        "url": "https://api.github.com/repos/Codertocat/Hello-World/labels/deploy",
        "name": "deploy",
        "color": "3D0C91",
        "default": false,
        "description": ""
      }
    ],
```


```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: EventListener
metadata:
  name: event-listener
spec:
  triggers:
  - name: pull-request
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
            'pullrequest'
```