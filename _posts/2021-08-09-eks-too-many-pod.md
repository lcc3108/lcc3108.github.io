---
layout: post
title: EKS worker node pod 한도 늘리기(too many pod 해결)
categories: [Kubernetes]
tags: [Kubernetes, EKS]
comments: true
---

- [개요](#개요)
- [해결방법](#해결방법)
- [설정방법](#설정방법)
  - [준비사항](#준비사항)
  - [설정](#설정)
  - [검증](#검증)

## 개요
AWS에서 제공하는 Kubernetes 서비스인 EKS를 사용하게되면 마스터노드에 대해 AWS에서 관리해주기 때문에 신경쓸 부분이 없다.

worker node(이하 워커노드)도 node group을 사용하게된다면 자동적으로 스케일링, 사양변경시 pod eviction 및 재배치를 해준다.

AWS에서 worker node를 사용할때 제약사항이 있는데 그것은 인스턴스 타입별로 최대 Pod 개수가 정해져있다는 것이다.

이는 EKS의 기능상 제약사항이 아닌 워커노드가 실행중인 EC2의 Elastic Network Interface(ENI)의 개수의 및 ENI별로 할당가능한 IP주소의 개수에서 나온다.

컨테이너 오케스트레이션 툴이 각 컨테이너를 식별할 수 있도록 고유한 IP를 부여해야한다.

EC2의 인스턴스 타입별로 ENI의 제약이 걸려있는데 워커노드에 팟이 생성될때마다 Amazon VPC CNI에 의해 ENI에 IP주소할당이 이루어진다.

만약 최대치를 넘는 팟을 생성하려한다면 워커노드에서 ENI에 IP할당에 실패하여 `Pending` 상태로 기다리게되며 `kubectl describe pod`명령어를 통해 이유는 `too many pod`이라고 나온다.

자세한 내용은 [AWS CNI Docs](https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/pod-networking.html)에서 확인가능하다.

또한 인스턴스 유형별로 ENI와 ENI에서 할당가능한 프라이빗 IP 주소 개수는 [AWS ENI Docs](https://docs.aws.amazon.com/ko_kr/AWSEC2/latest/UserGuide/using-eni.html#AvailableIpPerENI)에서 확인가능하다.

인스턴스 타입별 최대 팟의 개수는 [AWS Github](https://github.com/awslabs/amazon-eks-ami/blob/master/files/eni-max-pods.txt)에서 확인가능하며 식은 아래와같다.

네트워크 인터페이스별 최초 1개의 IP는 EC2에 할당될때 사용되므로 `(ENI 개수 * 할당가능한 IP - 1)`에 CNI와 kube-proxy용으로 2개를 더한 개수이다.


```bash
(Number of network interfaces for the instance type × (the number of IP addressess per network interface - 1)) + 2
```

## 해결방법
기존 해결방법은 인스턴스 타입을 높게 변경하는 방법 뿐이였다.

그러나 AWS에서 [IP prefixes](https://aws.amazon.com/ko/about-aws/whats-new/2021/07/amazon-virtual-private-cloud-vpc-customers-can-assign-ip-prefixes-ec2-instances/)기능을 사용해 기존 제한보다 더 많은 팟을 생성할 수 있다.

해당 기능은 개별 아이피 주소를 할당하는 대신 ip prefix를 활용해 기존의 할당가능한 아이피의 개수에 약 16배를 늘려준다.

즉 `(ENI 개수 * ((ENI별 할당가능한 IP - 1) * (IP Prefix 개수==16)) + 2)`만큼의 Pod을 사용할수 있게 된다.

## 설정방법

[EKS IP prefix Docs](https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/cni-increase-ip-addresses.html) 문서를 참고하여 설정이 가능하다.

2021-08-09일 기준 설치법
### 준비사항
- aws cli로 eks 관리가능
- kubectl을 통한 클러스터 접근가능

### 설정
1. AWS VPC CNI 버전 1.19이상으로 설치 
   ```bash
   #현재 사용버전확인
   $ aws eks describe-addon \
    --cluster-name my-cluster \
    --addon-name vpc-cni \
    --query "addon.addonVersion" \
    --output text
   # VPC CNI 업데이트
   $ aws eks update-addon \
    --cluster-name my-cluster \
    --addon-name vpc-cni \
    --addon-version 1.9.0-eksbuild.1 \
    --resolve-conflicts OVERWRITE 
  ```
2. prefix-ip 활성화
   ```bash
   kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true
   ```
3. 워커노드 인스턴스 타입의 최대 pod개수 구하기
   1. sh 파일 다운로드
      ```bash
      curl -o max-pods-calculator.sh https://raw.githubusercontent.com/awslabs/amazon-eks-ami/master/files/max-pods-calculator.sh
      chmod +x max-pods-calculator.sh
      ```
   2. 계산(출력 결과물 ${OUTPUT})
      ```bash
      ./max-pods-calculator.sh --instance-type ${YOUR_POD_TYPE} --cni-version 1.9.0-eksbuild.1 --cni-prefix-delegation-enabled
      #output기록
      ```
4. [글](https://github.com/aws/amazon-vpc-cni-k8s/blob/master/docs/prefix-and-ip-target.md)을 읽고 상황에 맞는 옵션 활성화

    필자는 `kubectl set env ds aws-node -n kube-system WARM_PREFIX_TARGET=1` 사용
5. worker node 업데이트
     1. self managed
         ```bash
         --use-max-pods false --kubelet-extra-args '--max-pods=${OUTPUT}'
         ```
     2. managed
         ```bash
         eksctl create nodegroup \
         --cluster <my-cluster> \
         --region <us-west-2> \
         --name <my-nodegroup> \
         --node-type <m5.large> \
         --managed \
         --max-pods-per-node ${OUTPUT}
         ```
     3. managed use launch template
        ```bash
        --kubelet-extra-args '--max-pods=${OUTPUT}'
        ```
     4. bottlerocket user data에 settings.kubernetes.max-pods = ${OUTPUT} 부분에 추가 
     
        혹은 아래의 파일을 `eks-max-pod.yaml`로 저장후 `eksctl create cluster --config-file eks-max-pod.yaml `  실행

        ```yaml
        ---
        apiVersion: eksctl.io/v1alpha5
        kind: ClusterConfig

        metadata:
          name: bottlerocket
          region: us-west-2
          version: '1.21'

        nodeGroups:
          - name: ng-bottlerocket
            instanceType: m5.large
            desiredCapacity: 4
            amiFamily: Bottlerocket
            iam:
              attachPolicyARNs:
                  - arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy
                  - arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy
                  - arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
                  - arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
            ssh:
                allow: true
                publicKeyName: YOUR_EC2_KEYPAIR_NAME
            bottlerocket:
              settings:
                motd: "Hello from eksctl!"
                kubernetes:
                  maxPodsPerNode: ${OUTPUT}
        ```
        
### 검증
`kubectl describe node {NODE_NAME} | grep pods` 명령어로 ${OUTPUT}과 같게 변경되었는지 확인

   