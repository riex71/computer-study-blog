언어 모델에 긴 문서를 넣고 질문하면, 첫 토큰이 나오기까지 잠시 기다렸다가 이후에는 한 글자씩 답이 이어진다. 이미 읽은 문서를 모델이 매번 처음부터 다시 계산하는 것일까? 일반적인 자기회귀 Transformer는 그렇지 않다. 이전 토큰에서 계산한 Key와 Value를 **KV Cache**에 보관하고 다음 토큰에서 재사용한다.

그런데 이 최적화는 다른 문제를 만든다. 문맥이 길고 동시에 처리하는 요청이 많아질수록, 다시 계산하지 않으려고 저장한 벡터들이 GPU 메모리에서 점점 큰 자리를 차지한다. 결국 “연산을 아끼려고 만든 캐시”가 추론의 새로운 병목이 되는 것이다.

이 글은 세 질문을 따라간다. **KV Cache는 왜 필요한가. GQA는 무엇을 공유하는가. MLA는 왜 K와 V 대신 압축된 벡터를 저장하는가.** 마지막에는 같은 가상 모델을 놓고 메모리 크기를 직접 계산하고, 재현 가능한 Python 코드로 확인한다. 그림 6점은 원 논문을 참고해 이 글을 위해 새로 그린 설명용 도식이다. 논문 결과와 직접 계산한 예시를 구분해서 읽으면 좋다.

참고한 자료는 Hugging Face의 [KV Cache 설명](https://huggingface.co/docs/transformers/en/cache_explanation), Ainslie 외 연구진의 [GQA 논문(EMNLP 2023)](https://aclanthology.org/2023.emnlp-main.298/), DeepSeek-AI의 [DeepSeek-V2 논문(v5, 2024년 6월 19일)](https://arxiv.org/html/2405.04434v5)이다.

## 같은 문맥을 다시 계산하지 않기 {#why-cache}

먼저 모델이 자기회귀 방식으로 토큰을 생성한다고 하자. 현재 위치 $t$의 은닉 상태 $h_t$에서 Query, Key, Value를 만든다. 한 attention head에 대해 단순화하면 다음과 같다.

$$
q_t=W_Qh_t,\qquad k_t=W_Kh_t,\qquad v_t=W_Vh_t
$$

현재 Query는 앞에서 계산해 둔 Key들과 관련도를 비교하고, 그 결과를 이용해 Value를 가중합한다.

$$
\operatorname{Attention}(q_t,K_{\le t},V_{\le t})
=\operatorname{softmax}\left(\frac{q_tK_{\le t}^{\mathsf T}}{\sqrt{d_h}}\right)V_{\le t}
$$

여기서 $d_h$는 head 차원이다. 실제 구현은 여러 head와 causal mask, 위치 인코딩 등을 함께 사용하지만, 중요한 것은 현재 위치가 **과거 위치의 Key와 Value를 계속 참조한다**는 사실이다. 이전 토큰의 Key와 Value는 이미 계산했으므로 다음 토큰마다 반복해서 만들 필요가 없다. 이때 필요한 것이 KV Cache다.

<img src="../assets/kv-cache/fig-01-prefill-decode.svg" width="1280" height="600" alt="왼쪽은 프롬프트를 처리하며 각 층의 Key와 Value를 저장하는 Prefill, 오른쪽은 새 토큰을 생성하면서 과거 KV를 재사용하는 Decode를 나타낸 자체 도식">

그림 설명: 그림 1. Prefill에서는 프롬프트를 처리해 각 층의 KV Cache를 채우고, Decode에서는 새 위치의 Query로 과거 K·V를 읽어 attention을 수행한다. Studybase 자체 제작 도식. 토큰 표시는 개념 설명용이며 실제 tokenizer의 분할과 일치하지 않는다.

### Prefill과 Decode는 구분해야 한다 {#prefill-decode}

**Prefill**은 입력 프롬프트를 처리하는 단계다. 프롬프트 안의 여러 위치를 병렬로 계산하고, 미래 위치를 보지 않도록 causal attention을 적용한다. 이때 이후 생성에 사용할 K·V가 각 층에 저장된다. 길이가 $T$일 때 표준 dense attention의 토큰 쌍 연산은 대체로 $O(T^2)$ 규모지만, 실제 실행 시간은 커널과 GPU 병렬성에 크게 좌우된다.

**Decode**는 다음 토큰을 하나씩 생성하는 단계다. 각 단계에서 새 Query를 만들고, 앞서 쌓인 캐시의 K·V를 읽는다. 캐시 덕분에 과거의 K·V를 매번 다시 투영하지 않아도 된다. 하지만 현재 Query가 $T$개의 과거 위치를 읽는 일 자체가 사라지는 것은 아니다. 따라서 문맥이 길수록 한 토큰을 생성할 때 참조하는 캐시도 커진다. [Hugging Face, Caching](https://huggingface.co/docs/transformers/en/cache_explanation)

한 가지 구분이 필요하다. **KV Cache는 모델의 가중치를 저장하는 메모리와 다르다.** 가중치는 모델이 학습한 값이고, KV Cache는 현재 요청의 토큰을 처리하면서 생기는 중간 결과다. 서로 다른 요청은 보통 서로 다른 캐시를 가지며, 캐시 메모리는 실행 중 문맥 길이와 활성 요청 수에 따라 변한다.

## 캐시 용량은 무엇에 비례할까 {#memory-formula}

일반적인 Multi-Head Attention(MHA)에서는 각 layer, 각 토큰, 각 KV head에 대해 Key와 Value 두 벡터를 저장한다. Key와 Value의 head 차원이 모두 $d_h$이고, 저장 dtype이 원소당 $s$바이트라면 총 캐시 크기는 다음과 같다.

$$
\boxed{M_{\mathrm{KV}}=2\,B\,T\,L\,H_{\mathrm{KV}}\,d_h\,s}
$$

| 기호 | 의미 | 이 글의 예시 값 |
| --- | --- | ---: |
| $B$ | 배치 크기, 동시에 저장할 시퀀스 수 | 1 |
| $T$ | 시퀀스당 캐시에 저장된 토큰 수 | 4,096 |
| $L$ | attention layer 수 | 32 |
| $H_{\mathrm{KV}}$ | Key·Value head 수 | MHA는 32 |
| $d_h$ | KV head 하나의 차원 | 128 |
| $s$ | 원소당 바이트 수 | 2 (FP16) |

이 식은 **KV 텐서 자체의 이론적 저장량**이다. GPU에서 실제로 점유하는 전체 메모리에는 모델 가중치, activation, allocator 여유분, 블록 관리 정보, 패딩 등이 더 들어간다. Sliding-window attention이나 KV 양자화처럼 캐시 정책이 달라지면 그대로 적용할 수도 없다.

MHA에 수치를 대입해 보자.

$$
\begin{aligned}
M_{\mathrm{MHA}}
&=2\times1\times4096\times32\times32\times128\times2\\
&=2{,}147{,}483{,}648\;\text{bytes}\\
&=2\;\text{GiB}
\end{aligned}
$$

4,096토큰과 배치 1이라는 비교적 작은 예시에서도 캐시만 2 GiB다. 이 계산은 32층 전체에 대해 누적한 값이다. 문맥 길이를 두 배로 늘리거나 같은 길이의 요청을 두 개 동시에 처리하면, 같은 가정 아래에서 캐시 크기도 각각 두 배로 늘어난다.

여기에서 한 가지 단서가 보인다. **Query head 수가 아니라 KV head 수를 줄이면, 캐시 크기를 직접 줄일 수 있다.** 이것이 GQA의 출발점이다.

## GQA: Query는 여러 개, KV는 함께 쓰기 {#gqa}

기본 MHA에서는 Query head마다 자신과 짝을 이루는 Key·Value head를 갖는다. 예를 들어 Query head가 8개면 KV head도 보통 8개다. 모든 head가 서로 다른 관점으로 attention을 계산할 수 있지만, 각 head의 K·V를 과거 토큰마다 캐시에 저장해야 한다.

Multi-Query Attention(MQA)은 극단적으로 **모든 Query head가 K·V 한 쌍을 공유**한다. 캐시는 작아지지만, 서로 다른 head가 각자의 K·V 표현을 갖는 자유도도 줄어든다. Grouped-Query Attention(GQA)은 이 둘의 중간이다. 여러 Query head를 그룹으로 묶고 그룹마다 하나의 K·V head를 둔다. [Ainslie et al., 2023](https://aclanthology.org/2023.emnlp-main.298/)

<img src="../assets/kv-cache/fig-02-mha-gqa-mqa.svg" width="1260" height="635" alt="Query head 8개를 고정하고 MHA는 KV 8개, GQA는 KV 2개, MQA는 KV 1개를 사용하는 구조를 선으로 연결한 비교 도식">

그림 설명: 그림 2. MHA, GQA, MQA의 KV 공유 방식. Query head 8개를 고정한 단순 예시에서 GQA는 Query 4개가 하나의 KV head를 공유한다. Studybase 자체 제작 도식. 색과 연결선은 구조 설명용이다.

예를 들어 Query head가 32개이고 KV head가 8개라면, Query 네 개가 같은 KV head를 사용한다. 이 조건에서는 이론적 캐시 크기가 MHA의 $8/32=1/4$이 된다.

$$
\frac{M_{\mathrm{GQA}}}{M_{\mathrm{MHA}}}
=\frac{H_{\mathrm{KV,GQA}}}{H_{\mathrm{KV,MHA}}}
=\frac{8}{32}=0.25
$$

앞 절의 2 GiB MHA 예시는 KV head를 8개로 줄이면 **0.5 GiB(512 MiB)**가 된다. 반대로 MQA처럼 KV head를 1개로 줄이면 **64 MiB**까지 내려간다. 모두 레이어 수, 시퀀스 길이, head 차원, dtype이 같은 상태에서 캐시만 계산한 값이다.

여기서 두 가지 오해를 피하자. 첫째, **KV Cache가 75% 줄었다고 추론 시간이 75% 줄어드는 것은 아니다.** 둘째, **GQA가 항상 MHA와 같은 품질을 낸다는 뜻도 아니다.** GQA 원 논문은 기존 MHA 모델을 적은 추가 학습량으로 GQA로 바꾸는 방법을 제안하고, 실험한 설정에서 MHA에 가까운 품질과 MQA에 견줄 만한 추론 속도를 보고한다. 다른 모델·데이터·학습 방법에도 자동으로 성립하는 보장은 아니다.

## MLA: 공유를 넘어 K와 V의 저장 형식을 바꾸기 {#mla}

GQA가 줄인 것은 *KV head의 수*다. DeepSeek-V2의 Multi-head Latent Attention(MLA)은 한 단계 더 들어간다. **Key와 Value를 각각 완전한 형태로 저장하지 않고, 둘을 만들 수 있는 저차원 벡터를 공통으로 캐싱**한다.

기본 아이디어를 단순화하면 현재 hidden state $h_t$를 저차원 벡터 $c_t^{KV}$로 압축한다.

$$
\begin{aligned}
c_t^{KV}&=W^{DKV}h_t\\
k_t^C&=W^{UK}c_t^{KV}\\
v_t^C&=W^{UV}c_t^{KV}
\end{aligned}
$$

$W^{DKV}$는 압축하는 down-projection이고, $W^{UK},W^{UV}$는 각각 Key와 Value 쪽 표현으로 올리는 up-projection이다. 여기서 중요한 것은 $k_t^C$와 $v_t^C$를 긴 문맥 전체에 대해 별도로 저장할 필요가 없다는 사실이다. 과거 위치마다 상대적으로 작은 $c_t^{KV}$를 보관하고, 추론 계산을 그 표현에 맞춰 구성할 수 있다. [DeepSeek-V2 §2.1.2](https://arxiv.org/html/2405.04434v5#S2.SS1.SSS2)

그렇다면 압축된 벡터 하나만 저장하면 끝날까? 실제 MLA에는 중요한 예외가 있다. **위치 정보를 다루는 RoPE를 위한 Key 성분이 별도로 필요하다.**

### RoPE를 분리해야 하는 이유 {#decoupled-rope}

Rotary Position Embedding(RoPE)은 Query와 Key에 위치 의존적인 회전을 적용한다. 압축된 Key를 복원한 뒤 RoPE를 바로 적용하면, 위치마다 달라지는 회전 행렬이 중간에 끼어들어 일부 투영 행렬을 미리 합치는 최적화가 어려워진다. MLA는 이를 피하기 위해 내용(content) 경로와 위치(position) 경로를 분리한다.

- **내용 경로:** K·V에 공통인 압축 벡터 $c_t^{KV}$를 저장한다.
- **위치 경로:** RoPE를 적용한 공유 Key $k_t^R$를 별도로 저장한다.

개별 Query head에는 내용 Query $q_{t,i}^{C}$와 RoPE Query $q_{t,i}^{R}$가 있고, Key의 내용 부분과 위치 부분을 함께 사용해 attention 점수를 계산한다. 다만 **저장할 때는 head별 완전한 Key·Value를 캐싱하는 대신**, $c_t^{KV}$와 head 간 공유되는 $k_t^R$를 남긴다. [DeepSeek-V2 §2.1.3](https://arxiv.org/html/2405.04434v5#S2.SS1.SSS3)

<img src="../assets/kv-cache/fig-03-mla-cache.svg" width="1260" height="665" alt="MLA가 hidden state에서 512차원 KV latent와 64차원 RoPE 공유 key를 만들고 그 두 벡터를 캐시에 보관하는 개념도">

그림 설명: 그림 3. DeepSeek-V2의 MLA 저장 경로를 단순화한 자체 도식. 캐시에 남는 두 성분은 512차원 KV latent와 64차원 RoPE 공유 Key다. 전체 Query 생성, 투영 흡수 및 출력 계산의 세부 연산은 생략했다. [DeepSeek-V2 §2.1](https://arxiv.org/html/2405.04434v5#S2.SS1)을 바탕으로 Studybase 자체 제작.

DeepSeek-V2의 실제 설계값은 KV 압축 차원 $d_c=512$, 분리된 RoPE Key 차원 $d_R=64$다. 따라서 한 토큰, 한 층에서 저장하는 값은 다음처럼 **576개 원소**다. 원 논문이 제시하는 토큰당 저장량은 전체 층에 대해 $(d_c+d_R)L$개다.

$$
\boxed{M_{\mathrm{MLA}}=B\,T\,L\,(d_c+d_R)\,s}
$$

우리의 **가상 32층·4K·FP16 예시**에 이 압축 차원을 대입해 보면 다음과 같다.

$$
M_{\mathrm{MLA}}=1\times4096\times32\times(512+64)\times2
=144\;\text{MiB}
$$

MHA의 2,048 MiB와 비교하면 7.03%이고, GQA(KV head 8개)의 512 MiB보다도 작다. 다만 이것을 “실제 DeepSeek-V2 모델의 4K 캐시가 144 MiB”라고 읽으면 안 된다. **32층·32 Query head라는 모델 크기는 이 글이 만든 가정**이고, $d_c=512$와 $d_R=64$만 논문의 설정에서 가져왔다. 실제 DeepSeek-V2는 60층, Query head 128개를 사용한다. [DeepSeek-V2 §3.1.2](https://arxiv.org/html/2405.04434v5#S3.SS1.SSS2)

### 캐시를 줄여도 매번 복원해야 한다면? {#weight-absorption}

압축된 $c^{KV}$를 저장하고도 모든 과거 위치의 Key와 Value를 매번 완전히 복원하면 메모리는 줄어도 계산 비용이 커질 수 있다. MLA는 **행렬 곱의 결합법칙을 이용해 projection을 흡수(weight absorption)**한다. 내용 성분의 예를 들면 Query와 Key의 내적은 다음처럼 재배열할 수 있다.

$$
q^{\mathsf T}(W^{UK}c)
=\big((W^{UK})^{\mathsf T}q\big)^{\mathsf T}c
$$

즉 과거의 모든 Key를 원래 차원으로 복원하는 대신 **현재 Query를 변환한 뒤 압축된 캐시와 직접 비교**하는 형태를 만들 수 있다. Value 쪽도 선형 연산의 결합을 이용해, 압축된 Value의 가중합을 만든 뒤 출력 변환에 반영할 수 있다. 앞서 분리한 RoPE 경로가 이 최적화를 가능하게 하는 조건 중 하나다. [DeepSeek-V2 Appendix C](https://arxiv.org/html/2405.04434v5#A3)

여기까지의 목적은 세 가지를 연결하는 것이다. **저장하는 텐서를 줄이고, 위치 표현을 유지하면서, 복원 계산이 병목이 되지 않도록 수식을 재구성한다.** MLA가 단순한 “KV 압축 후 복원” 이상인 이유다.

## 같은 조건에서 비교해 보기 {#comparison}

이제 MHA, GQA, MQA, MLA를 한 표에 놓자. 아래 값은 모두 **32층, Query head 32개, head 차원 128, 4,096토큰, 배치 1, FP16**을 가정한다. MHA/GQA/MQA는 저장하는 KV head 수만 다르고, MLA는 별도로 $d_c=512$, $d_R=64$를 사용한다. 모든 행이 동일한 품질·연산량의 모델이라는 뜻은 아니다.

표 설명: 수식에 따른 KV Cache 이론 저장량. MiB = $2^{20}$ bytes, GiB = $2^{30}$ bytes.

| 방식 | 토큰·층당 캐시 원소 | 4K 전체 캐시 | MHA 대비 |
| --- | ---: | ---: | ---: |
| MHA, KV head 32 | 8,192 | 2,048 MiB = 2 GiB | 100% |
| GQA, KV head 8 | 2,048 | 512 MiB = 0.5 GiB | 25% |
| MLA, latent 512 + RoPE 64 | 576 | 144 MiB | 7.03% |
| MQA, KV head 1 | 256 | 64 MiB | 3.13% |

<img src="../assets/kv-cache/fig-04-cache-comparison.svg" width="1300" alt="4K 문맥, 32층, FP16일 때 MHA 2048 MiB, GQA 512 MiB, MLA 144 MiB, MQA 64 MiB를 비교한 가로 막대그래프">

그림 설명: 그림 4. 동일한 예시 조건에서 계산한 KV Cache 저장량. 캐시가 작은 순서가 모델 품질이나 생성 속도의 순서라는 뜻은 아니다. Studybase 자체 계산·제작.

MLA의 576개 원소는 GQA에서 KV head를 몇 개 둔 것과 비슷할까? GQA의 한 KV head는 Key와 Value가 각각 128차원이므로 총 256개 원소다. 따라서 $576/256=2.25$다. DeepSeek-V2 논문의 Table 1에서도 MLA의 캐시 크기를 **KV group이 2.25개인 GQA와 같은 수준**이라고 표현한다. 그룹 수 2.25개를 실제로 구현한다는 뜻이 아니라 **저장 원소 수를 비교한 비율**이다. [DeepSeek-V2 Table 1](https://arxiv.org/html/2405.04434v5#S2.T1)

## 문맥과 배치를 늘리면 차이는 얼마나 커질까 {#scaling}

같은 설정을 유지한 채 문맥 길이를 늘리면 모든 방식의 저장량은 선형으로 증가한다. 상대적인 감소율은 유지되지만, 절감되는 **절대 바이트 수**는 커진다. 예를 들어 배치 1, 32K 문맥이라면 MHA는 16 GiB, GQA는 4 GiB, MLA는 1.125 GiB, MQA는 0.5 GiB다.

<img src="../assets/kv-cache/fig-05-context-scaling.svg" width="1300" alt="문맥 길이가 1K에서 32K로 늘어날 때 MHA, GQA, MLA, MQA의 KV Cache 저장량이 각각 선형으로 증가하는 그래프">

그림 설명: 그림 5. 시퀀스 길이에 따른 캐시 크기 변화. 배치 1·32층·FP16을 고정한 이론 계산이며 실측 지연시간이나 품질 지표가 아니다. Studybase 자체 계산·제작.

실제 서버에서는 한 명의 요청만 처리하지 않는다. 같은 길이의 독립된 요청을 $B$개 동시에 진행한다면 캐시 용량도 $B$에 비례한다. 16K 문맥의 요청 네 개를 모두 캐시에 유지한다고 가정하면, 위 설정에서 MHA 32 GiB, GQA 8 GiB, MLA 2.25 GiB, MQA 1 GiB다.

물론 운영 서버에서는 요청마다 길이가 다르고, paged allocation·prefix sharing·eviction·offloading 등도 개입한다. 따라서 실제 예약 메모리가 단순히 $B\times T$로 정확하게 떨어지지는 않는다. 그래도 **저장해야 하는 KV 원소의 기본 규모**를 가늠하는 출발점으로는 유용하다.

### 코드를 실행해 숫자 검증하기 {#experiment}

GPU 없이 Python 표준 라이브러리만으로 확인해 보자. 이 코드는 벡터를 실제로 만들지 않고, 저장해야 할 원소 수만 계산한다.

```python
MIB = 1024 ** 2


def kv_cache_mib(batch, tokens, layers, kv_heads, head_dim=128, bytes_per_elem=2):
    elements = 2 * batch * tokens * layers * kv_heads * head_dim
    return elements * bytes_per_elem / MIB


def mla_cache_mib(batch, tokens, layers, latent_dim=512, rope_dim=64, bytes_per_elem=2):
    elements = batch * tokens * layers * (latent_dim + rope_dim)
    return elements * bytes_per_elem / MIB


B, T, L = 1, 4096, 32
results = {
    "MHA (32 KV)": kv_cache_mib(B, T, L, 32),
    "GQA (8 KV)": kv_cache_mib(B, T, L, 8),
    "MLA (512+64)": mla_cache_mib(B, T, L),
    "MQA (1 KV)": kv_cache_mib(B, T, L, 1),
}

baseline = results["MHA (32 KV)"]
for name, mib in results.items():
    print(f"{name:14} {mib:7.1f} MiB   ({mib / baseline * 100:5.2f}%)")
```

출력은 다음과 같다.

```text
MHA (32 KV)    2048.0 MiB   (100.00%)
GQA (8 KV)      512.0 MiB   (25.00%)
MLA (512+64)    144.0 MiB   ( 7.03%)
MQA (1 KV)       64.0 MiB   ( 3.12%)
```

여기서 3.12%는 Python의 표시 형식과 부동소수점 반올림 방식으로 나온 값이다. 정확한 비율은 $1/32=3.125\%$다. 코드를 바꿔 볼 때는 `tokens=32768`, `batch=4`, `bytes_per_elem=1`처럼 한 변수씩 바꾸면 효과를 확인하기 쉽다. 마지막 경우는 **원소를 1바이트로 저장한다는 계산상의 가정**일 뿐, 모든 모델이 손실 없이 KV를 8비트로 변환할 수 있다는 뜻은 아니다.

## 논문은 실제 품질과 효율을 어떻게 비교했을까 {#paper-results}

지금까지의 표와 그래프는 계산된 캐시 크기이지 벤치마크가 아니다. 논문이 보고한 결과는 별도로 읽어야 한다. DeepSeek-V2 Appendix D.2는 MLA와 MHA만 다른 MoE 모델을 두 규모에서 비교한다. 여기서는 그중 KV Cache와 MMLU 수치만 발췌했다.

표 설명: [DeepSeek-V2 Appendix D, Table 9](https://arxiv.org/html/2405.04434v5#A4.T9)의 발췌. KV Cache는 시퀀스 전체가 아니라 **토큰 하나에 대한 전체 층의 원소 수**다. MMLU는 5-shot accuracy(%)이며 모델 규모·학습 설정이 다른 두 그룹 사이를 직접 비교하는 표가 아니다.

| 비교 그룹 | 지표 | MHA | MLA |
| --- | --- | ---: | ---: |
| 소형 MoE | KV Cache / token | 110.6K 원소 | 15.6K 원소 |
| 소형 MoE | MMLU 5-shot | 48.7 | 50.0 |
| 대형 MoE | KV Cache / token | 860.2K 원소 | 34.6K 원소 |
| 대형 MoE | MMLU 5-shot | 57.5 | 59.0 |

이 설정에서는 MLA가 더 적은 캐시 원소를 사용하면서 MMLU 점수도 높다. 하지만 이것을 다른 모든 구조와 데이터셋에 일반화하면 곤란하다. 같은 부록의 GQA·MQA 비교에서는 일부 어려운 벤치마크에서 MHA가 더 좋은 결과를 내기도 한다. 구조를 선택할 때는 **저장량, 실제 지연시간, 학습 비용, 품질**을 함께 봐야 한다. [DeepSeek-V2 Appendix D.1–D.2](https://arxiv.org/html/2405.04434v5#A4)

DeepSeek-V2 논문 초록의 “KV Cache 93.3% 감소”도 자주 인용된다. 이는 **DeepSeek 67B와 DeepSeek-V2를 비교한 논문 보고값**이지, 위 32층 가상 모델에서 계산한 감소율이나 MLA를 적용하는 모든 모델의 보편적인 절감률이 아니다. 기준 모델이 무엇인지 반드시 함께 적어야 한다. [DeepSeek-V2 Abstract](https://arxiv.org/html/2405.04434v5)

## 캐시가 작아지면 무조건 빨라질까 {#limitations}

<img src="../assets/kv-cache/fig-06-bottleneck.svg" width="1260" height="560" alt="KV Cache 저장 공간, Decode 중 메모리 읽기량, 실제 생성 지연시간은 연결되지만 서로 같은 값이 아니라는 구조도">

그림 설명: 그림 6. 캐시 용량, 메모리 트래픽, 추론 지연시간의 관계. 용량을 줄이는 구조 변화가 성능 개선에 기여할 수 있어도 두 비율을 같게 놓을 수는 없다. Studybase 자체 제작 도식.

Decode는 많은 설정에서 메모리 대역폭의 영향을 강하게 받는다. 긴 캐시를 반복해서 읽어야 하고, 여러 요청을 함께 처리하면 캐시와 가중치를 운반하는 방식이 중요해진다. 하지만 실제 생성 속도는 가중치 로딩, 연산량, 커널 효율, batch scheduling, 텐서 병렬 처리, GPU 종류에도 달려 있다. 따라서 캐시 바이트 수는 속도의 유용한 단서이지만 완전한 성능 모델은 아니다.

여기서 비슷하게 들리는 다른 최적화와도 구분해 두자.

- **FlashAttention:** attention 계산 과정에서 불필요한 메모리 입출력과 중간 행렬 저장을 줄이는 접근이다. GQA나 MLA처럼 지속적으로 보관하는 KV 벡터의 차원을 직접 줄이는 것과는 목적이 다르다.
- **PagedAttention:** KV Cache를 블록 단위로 관리해 메모리 낭비와 요청별 할당 문제를 줄이는 접근이다. 저장할 벡터가 몇 차원인지를 바꾸는 GQA·MLA와는 다른 축의 최적화다.
- **KV 양자화·오프로딩·슬라이딩 윈도:** KV를 더 작은 dtype으로 저장하거나, 다른 메모리 계층으로 옮기거나, 보유할 문맥의 범위를 제한하는 방법이다. 각 방법은 정확도·전송량·지원하는 attention 패턴에 별도의 제약을 준다.

실무에서는 이 기술들이 서로 배타적이지 않다. 하나는 **무엇을 저장할지**, 다른 하나는 **어디에 어떻게 저장하고 가져올지**, 또 다른 하나는 **계산을 어떻게 실행할지**를 바꾸기 때문이다.

## 결론: 캐시는 단순한 메모가 아니라 아키텍처의 일부다 {#conclusion}

처음 질문으로 돌아오자. KV Cache는 과거 토큰의 Key·Value를 재활용해 중복 계산을 줄여 주지만, 시퀀스가 길어질수록 저장량과 읽기 비용이 증가한다. MHA는 head별 KV를 저장하고, GQA는 여러 Query head가 같은 KV를 공유해 개수를 줄인다. MLA는 K와 V의 공통 저차원 표현을 저장하고, 위치 정보를 분리해 그 표현을 추론 과정에서 효율적으로 사용할 수 있게 만든다.

기존에 살펴본 Mamba와 나란히 보면 차이가 더 분명하다. Mamba가 과거 입력을 **고정 크기 recurrent state**로 갱신하는 구조라면, 여기서 본 Transformer의 KV Cache는 과거 위치별 정보를 **문맥 길이에 비례하는 저장소**에 남긴다. Engram이 학습된 메모리 테이블에서 표현을 *조회*하는 경로라면, KV Cache는 **현재 요청의 토큰에서 실시간으로 생긴 중간 결과**를 보관하는 경로다. 모두 ‘메모리’를 이야기하지만 같은 저장소는 아니다.

결국 좋은 추론 구조는 attention 수식만으로 결정되지 않는다. 어떤 정보는 매번 계산하고, 어떤 정보는 공유하고, 어떤 정보는 압축해서 남길지까지 모델 아키텍처가 정한다. **KV Cache를 보면 LLM이 정보를 기억하는 방식뿐 아니라, 그 기억을 GPU에서 유지하는 비용까지 보이기 시작한다.**

### 참고 자료와 그림 출처 {#references}

1. Hugging Face, [Caching](https://huggingface.co/docs/transformers/en/cache_explanation), Transformers 문서. Prefill, Decode, KV Cache의 기본 동작.
2. Ainslie et al., [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://aclanthology.org/2023.emnlp-main.298/), EMNLP 2023. GQA와 MQA, MHA의 관계 및 uptraining 실험.
3. DeepSeek-AI, [DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model](https://arxiv.org/html/2405.04434v5), arXiv:2405.04434v5 (2024-06-19). 특히 §2.1, Table 1, Appendix C–D.
4. Dao et al., [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135), NeurIPS 2022. 메모리 입출력 관점의 attention 최적화.
5. Kwon et al., [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180), SOSP 2023. 블록 단위 KV Cache 관리.

그림 1–3 및 6은 위 논문·공식 문서를 참고해 **Studybase용으로 새로 그린 자체 설명 도식**이다. 그림 4–5는 본문에서 명시한 가상 조건으로 직접 계산한 값이다. 원 논문의 도판이나 실측 그래프를 재배포한 것이 아니다.
