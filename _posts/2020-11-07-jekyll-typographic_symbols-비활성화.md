---
layout: post
title: 깃허브 블로그(jekyll) 활자체 기호 비활성화(typographic_symbols)
categories: [jekyll]
tags: [jekyll, kramdown ]
comments: true
---

jekyll을 사용하는 깃허브 블로그중에서 kramdown 마크다운을 사용하는 블로그는 따옴표("), << 꺽쇠 2개 등이 활자체로 변경된다.

주로 기술, 개발블로그가 많기때문에 따옴표 꺽쇠등이 변환되면 블로그에서 복사 붙여넣기시 다른 문자기때문에 제대로 동작하지 않게된다.

jekyll을 쓰고있다면 루트 디렉토리에 _config.yml파일이 있는데 내 블로그를 예시로 들자면 아래와같다.

**_config.yml**파일에서 **kramdown**에 **typographic_symbols**과 **smart_quotes가** 없다면 **추가**시켜주면된다.

```yaml
##########################
# 기타 설정
# ...
##########################

# 마크다운중에서 kramdown을 사용하는 설정
markdown: kramdown

##########################
# 기타 설정
# ...
##########################

#kramdown 옵션들 중에서 typographic_symbols 해당 항목이 활자체 기호를 관리한다.

kramdown:
  syntax_highlighter: rouge
  auto_ids: true
  footnote_nr: 1
  entity_output: as_char
  toc_levels: 1..6
  enable_coderay: false
  typographic_symbols:
    {
      hellip: ...,
      mdash: ---,
      ndash: --,
      laquo: "<<",
      raquo: ">>",
      laquo_space: "<< ",
      raquo_space: " >>",
    }
  smart_quotes: apos,apos,quot,quot

########################
#기타설정
########################
```
