---
order: 2
---
# 创建提案

一个区块由头部、交易、投票（提交）和违规证据列表（即签署冲突的投票）组成。

我们每个区块最多包含不超过最大区块大小（`ConsensusParams.Block.MaxBytes`）的十分之一的证据。

## 从内存池中获取交易

当我们从内存池中获取交易时，我们通过减去最大头部大小（`MaxHeaderBytes`）、块的最大氨基开销（`MaxAminoOverheadForBlock`）、最后一次提交的大小（如果存在）和证据的大小（如果存在）来计算最大数据大小。在获取过程中，我们为每个交易计算氨基开销。

```go
func MaxDataBytes(maxBytes int64, valsCount, evidenceCount int) int64 {
 return maxBytes -
  MaxOverheadForBlock -
  MaxHeaderBytes -
  int64(valsCount)*MaxVoteBytes -
  int64(evidenceCount)*MaxEvidenceBytes
}
```

## 在内存池中验证交易

在我们接受内存池中的交易之前，我们检查其大小是否不超过{MaxDataSize}。{MaxDataSize}使用与上述相同的公式计算，只是我们通过最大证据数量{MaxNum}减去最大证据大小。

```go
func MaxDataBytesUnknownEvidence(maxBytes int64, valsCount int) int64 {
 return maxBytes -
  MaxOverheadForBlock -
  MaxHeaderBytes -
  (maxNumEvidence * MaxEvidenceBytes)
}
```


---
order: 2
---
# Creating a proposal

A block consists of a header, transactions, votes (the commit),
and a list of evidence of malfeasance (ie. signing conflicting votes).

We include no more than 1/10th of the maximum block size
(`ConsensusParams.Block.MaxBytes`) of evidence with each block.

## Reaping transactions from the mempool

When we reap transactions from the mempool, we calculate maximum data
size by subtracting maximum header size (`MaxHeaderBytes`), the maximum
amino overhead for a block (`MaxAminoOverheadForBlock`), the size of
the last commit (if present) and evidence (if present). While reaping
we account for amino overhead for each transaction.

```go
func MaxDataBytes(maxBytes int64, valsCount, evidenceCount int) int64 {
 return maxBytes -
  MaxOverheadForBlock -
  MaxHeaderBytes -
  int64(valsCount)*MaxVoteBytes -
  int64(evidenceCount)*MaxEvidenceBytes
}
```

## Validating transactions in the mempool

Before we accept a transaction in the mempool, we check if it's size is no more
than {MaxDataSize}. {MaxDataSize} is calculated using the same formula as
above, except we subtract the max number of evidence, {MaxNum} by the maximum size of evidence

```go
func MaxDataBytesUnknownEvidence(maxBytes int64, valsCount int) int64 {
 return maxBytes -
  MaxOverheadForBlock -
  MaxHeaderBytes -
  (maxNumEvidence * MaxEvidenceBytes)
}
```
