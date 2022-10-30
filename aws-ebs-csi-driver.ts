import * as aws from "@pulumi/aws";
import * as pulumi from '@pulumi/pulumi'
import * as eks from "@pulumi/eks";

// Creating an EKS cluster
const cluster = new eks.Cluster("my-cluster",{
    // OIDC in necessary
    createOidcProvider: true,
  });

// helper variables for naming
let stackName = pulumi.getStack();
const clusterName = cluster.eksCluster.name
const clusterOidcProvider = cluster.core.oidcProvider;
  

const saAssumeRolePolicy = pulumi
  .all([clusterOidcProvider?.url, clusterOidcProvider?.arn])
  .apply(([url, arn]) =>
    aws.iam.getPolicyDocument({
      statements: [
        {
          actions: ['sts:AssumeRoleWithWebIdentity'],
          conditions: [
            {
              test: 'StringEquals',
              values: [`system:serviceaccount:kube-system:ebs-csi-controller-sa`],
              variable: `${url.replace('https://', '')}:sub`,
            },
          ],
          effect: 'Allow',
          principals: [{identifiers: [arn], type: 'Federated'}],
        },
      ],
    })
  );

// Creating an IAM role
export const role = new aws.iam.Role(`${stackName}-AmazonEKS_EBS_CSI_DriverRole`, {
    assumeRolePolicy: saAssumeRolePolicy.json
  });

// Creating IAM Policy with permissions needed for CSI Add-on to work
const csi_driver_policy = new aws.iam.Policy(`${stackName}-AmazonEKS_EBS_CSI_Driver_Policy`, {
    path: "/",
    description: "A policy for Amazon EBS CSI Driver permissions",
    policy: JSON.stringify({
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:CreateSnapshot",
                    "ec2:AttachVolume",
                    "ec2:DetachVolume",
                    "ec2:ModifyVolume",
                    "ec2:DescribeAvailabilityZones",
                    "ec2:DescribeInstances",
                    "ec2:DescribeSnapshots",
                    "ec2:DescribeTags",
                    "ec2:DescribeVolumes",
                    "ec2:DescribeVolumesModifications"
                ],
                "Resource": "*"
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:CreateTags"
                ],
                "Resource": [
                    "arn:aws:ec2:*:*:volume/*",
                    "arn:aws:ec2:*:*:snapshot/*"
                ],
                "Condition": {
                    "StringEquals": {
                        "ec2:CreateAction": [
                            "CreateVolume",
                            "CreateSnapshot"
                        ]
                    }
                }
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:DeleteTags"
                ],
                "Resource": [
                    "arn:aws:ec2:*:*:volume/*",
                    "arn:aws:ec2:*:*:snapshot/*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:CreateVolume"
                ],
                "Resource": "*",
                "Condition": {
                    "StringLike": {
                        "aws:RequestTag/ebs.csi.aws.com/cluster": "true"
                    }
                }
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:CreateVolume"
                ],
                "Resource": "*",
                "Condition": {
                    "StringLike": {
                        "aws:RequestTag/CSIVolumeName": "*"
                    }
                }
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:DeleteVolume"
                ],
                "Resource": "*",
                "Condition": {
                    "StringLike": {
                        "ec2:ResourceTag/CSIVolumeName": "*"
                    }
                }
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:DeleteVolume"
                ],
                "Resource": "*",
                "Condition": {
                    "StringLike": {
                        "ec2:ResourceTag/ebs.csi.aws.com/cluster": "true"
                    }
                }
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:DeleteSnapshot"
                ],
                "Resource": "*",
                "Condition": {
                    "StringLike": {
                        "ec2:ResourceTag/CSIVolumeSnapshotName": "*"
                    }
                }
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:DeleteSnapshot"
                ],
                "Resource": "*",
                "Condition": {
                    "StringLike": {
                        "ec2:ResourceTag/ebs.csi.aws.com/cluster": "true"
                    }
                }
            }
        ]
    }),
});

// Attaching the Policy to the Role
const rpa = new aws.iam.RolePolicyAttachment(`${stackName}-csi-driver-policy`, { policyArn: csi_driver_policy.arn, role: role });

// Installing the add-on on the cluster, adding the ROLE-ARN so that the serviceaccounts will be able annotated with it. and used to authenticate with our cluster OIDC.
const ebs_csi_driver_addon = new aws.eks.Addon("aws-ebs-csi-driver-addon", {
    clusterName: clusterName,
    addonName: "aws-ebs-csi-driver",
    addonVersion: "v1.11.4-eksbuild.1",
    resolveConflicts: "OVERWRITE",
    serviceAccountRoleArn: role.arn
});