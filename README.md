# pulumi-aws-ebs-csi-driver
This repository contains Pulumi's Infrastructure as Code for Installing EBS CSI driver in EKS cluster 

## Context
The Amazon EBS CSI plugin that will be installed in your cluster requires IAM permissions to make calls to AWS APIs on your behalf to provision storage etc. 

The plugin needs to be installed and annotated with a service account that will be authenticated against the cluster's OIDC (OpenID Connect), the OIDC config allows the serviceAccount associated with the add-on we installed to assume the A Role associated with a policy that allows the permissions needed by the EBS CSI Driver Pods.

More about the manual steps in [AWS DOCS](https://docs.aws.amazon.com/eks/latest/userguide/csi-iam-role.html).
