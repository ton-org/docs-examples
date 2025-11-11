# Wallet Fee Comparison Results

## Run 1: 1 messages, Body: Empty

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Wallet V2R1** ✅ | 1 | 2,769 | 2,769 | 0.0017108 | 0.0017108 | **Best** | **Best** | 13s | 4s |
| Wallet V2R2 | 1 | 2,846 | 2,846 | 0.0017416 | 0.0017416 | +2.78% | +1.80% | 13s | 4s |
| Wallet V3R1 | 1 | 2,917 | 2,917 | 0.00177 | 0.00177 | +5.34% | +3.46% | 13s | 4s |
| Wallet V3R2 | 1 | 2,994 | 2,994 | 0.0018008 | 0.0018008 | +8.12% | +5.26% | 13s | 4s |
| Wallet V4R2 | 1 | 3,308 | 3,308 | 0.0019264 | 0.0019264 | +19.46% | +12.60% | 13s | 4s |
| Wallet V5R1 | 1 | 4,939 | 4,939 | 0.0026748 | 0.0026748 | +78.36% | +56.34% | 13s | 4s |
| Highload Wallet V3 | 1 | 7,956 | 7,956 | 0.0049124 | 0.0049124 | +187.32% | +187.14% | 13s | 4s |

## Run 2: 4 messages, Body: Empty

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Wallet V2R1** ✅ | 1 | 4,695 | 1,173 | 0.0030908 | 0.0007727 | **Best** | **Best** | 13s | 4s |
| Wallet V2R2 | 1 | 4,772 | 1,193 | 0.0031216 | 0.0007804 | +1.70% | +0.99% | 13s | 4s |
| Wallet V3R1 | 1 | 4,843 | 1,210 | 0.00315 | 0.0007875 | +3.15% | +1.91% | 13s | 4s |
| Wallet V3R2 | 1 | 4,920 | 1,230 | 0.0031808 | 0.0007952 | +4.85% | +2.91% | 13s | 4s |
| Wallet V4R2 | 1 | 5,234 | 1,308 | 0.0033064 | 0.0008266 | +11.50% | +6.97% | 13s | 4s |
| Wallet V5R1 | 1 | 7,090 | 1,772 | 0.0043128 | 0.0010782 | +51.06% | +39.53% | 13s | 4s |
| Highload Wallet V3 | 1 | 7,956 | 1,989 | 0.0064676 | 0.0016169 | +69.56% | +109.25% | 13s | 4s |

## Run 3: 200 messages, Body: Empty

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wallet V2R1 | 50 | 234,750 | 1,173 | 0.15454 | 0.0007727 | +2907.69% | +42.99% | 10m 50s | 3m 20s |
| Wallet V2R2 | 50 | 238,600 | 1,193 | 0.15608 | 0.0007804 | +2958.97% | +44.41% | 10m 50s | 3m 20s |
| Wallet V3R1 | 50 | 242,150 | 1,210 | 0.1575 | 0.0007875 | +3002.56% | +45.73% | 10m 50s | 3m 20s |
| Wallet V3R2 | 50 | 246,000 | 1,230 | 0.15904 | 0.0007952 | +3053.84% | +47.15% | 10m 50s | 3m 20s |
| Wallet V4R2 | 50 | 261,700 | 1,308 | 0.16532 | 0.0008266 | +3253.84% | +52.96% | 10m 50s | 3m 20s |
| Wallet V5R1 | 1 | 147,622 | 738 | 0.1113288 | 0.000556644 | +1792.30% | +3.01% | 13s | 4s |
| **Highload Wallet V3** ✅ | 1 | 7,956 | 39 | 0.108074 | 0.00054037 | **Best** | **Best** | 13s | 4s |

## Run 4: 1000 messages, Body: Empty

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wallet V2R1 | 250 | 1,173,750 | 1,173 | 0.7727 | 0.0007727 | +3683.87% | +44.18% | 54m 10s | 16m 40s |
| Wallet V2R2 | 250 | 1,193,000 | 1,193 | 0.7804 | 0.0007804 | +3748.38% | +45.61% | 54m 10s | 16m 40s |
| Wallet V3R1 | 250 | 1,210,750 | 1,210 | 0.7875 | 0.0007875 | +3803.22% | +46.94% | 54m 10s | 16m 40s |
| Wallet V3R2 | 250 | 1,230,000 | 1,230 | 0.7952 | 0.0007952 | +3867.74% | +48.37% | 54m 10s | 16m 40s |
| Wallet V4R2 | 250 | 1,308,500 | 1,308 | 0.8266 | 0.0008266 | +4119.35% | +54.23% | 54m 10s | 16m 40s |
| Wallet V5R1 | 4 | 733,888 | 733 | 0.554515201 | 0.000554515 | +2264.51% | +3.46% | 52s | 16s |
| **Highload Wallet V3** ✅ | 4 | 31,689 | 31 | 0.535922 | 0.000535922 | **Best** | **Best** | 13s | 4s |

## Run 5: 1 messages, Body: Comment

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Wallet V2R1** ✅ | 1 | 2,769 | 2,769 | 0.001762 | 0.001762 | **Best** | **Best** | 13s | 4s |
| Wallet V2R2 | 1 | 2,846 | 2,846 | 0.0017928 | 0.0017928 | +2.78% | +1.74% | 13s | 4s |
| Wallet V3R1 | 1 | 2,917 | 2,917 | 0.0018212 | 0.0018212 | +5.34% | +3.35% | 13s | 4s |
| Wallet V3R2 | 1 | 2,994 | 2,994 | 0.001852 | 0.001852 | +8.12% | +5.10% | 13s | 4s |
| Wallet V4R2 | 1 | 3,308 | 3,308 | 0.0019776 | 0.0019776 | +19.46% | +12.23% | 13s | 4s |
| Wallet V5R1 | 1 | 4,939 | 4,939 | 0.002726 | 0.002726 | +78.36% | +54.71% | 13s | 4s |
| Highload Wallet V3 | 1 | 7,956 | 7,956 | 0.0050148 | 0.0050148 | +187.32% | +184.60% | 13s | 4s |

## Run 6: 4 messages, Body: Comment

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Wallet V2R1** ✅ | 1 | 4,695 | 1,173 | 0.0032956 | 0.0008239 | **Best** | **Best** | 13s | 4s |
| Wallet V2R2 | 1 | 4,772 | 1,193 | 0.0033264 | 0.0008316 | +1.70% | +0.93% | 13s | 4s |
| Wallet V3R1 | 1 | 4,843 | 1,210 | 0.0033548 | 0.0008387 | +3.15% | +1.79% | 13s | 4s |
| Wallet V3R2 | 1 | 4,920 | 1,230 | 0.0033856 | 0.0008464 | +4.85% | +2.73% | 13s | 4s |
| Wallet V4R2 | 1 | 5,234 | 1,308 | 0.0035112 | 0.0008778 | +11.50% | +6.54% | 13s | 4s |
| Wallet V5R1 | 1 | 7,090 | 1,772 | 0.0045176 | 0.0011294 | +51.06% | +37.07% | 13s | 4s |
| Highload Wallet V3 | 1 | 7,956 | 1,989 | 0.0068772 | 0.0017193 | +69.56% | +108.67% | 13s | 4s |

## Run 7: 200 messages, Body: Comment

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wallet V2R1 | 50 | 234,750 | 1,173 | 0.16478 | 0.0008239 | +2907.69% | +35.54% | 10m 50s | 3m 20s |
| Wallet V2R2 | 50 | 238,600 | 1,193 | 0.16632 | 0.0008316 | +2958.97% | +36.81% | 10m 50s | 3m 20s |
| Wallet V3R1 | 50 | 242,150 | 1,210 | 0.16774 | 0.0008387 | +3002.56% | +37.97% | 10m 50s | 3m 20s |
| Wallet V3R2 | 50 | 246,000 | 1,230 | 0.16928 | 0.0008464 | +3053.84% | +39.24% | 10m 50s | 3m 20s |
| Wallet V4R2 | 50 | 261,700 | 1,308 | 0.17556 | 0.0008778 | +3253.84% | +44.41% | 10m 50s | 3m 20s |
| **Wallet V5R1** ✅ | 1 | 147,622 | 738 | 0.1215688 | 0.000607844 | +1792.30% | **Best** | 13s | 4s |
| **Highload Wallet V3**  | 1 | 7,956 | 39 | 0.128554 | 0.00064277 | **Best** | +5.74% | 13s | 4s |

## Run 8: 1000 messages, Body: Comment

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wallet V2R1 | 250 | 1,173,750 | 1,173 | 0.8239 | 0.0008239 | +3683.87% | +36.02% | 54m 10s | 16m 40s |
| Wallet V2R2 | 250 | 1,193,000 | 1,193 | 0.8316 | 0.0008316 | +3748.38% | +37.29% | 54m 10s | 16m 40s |
| Wallet V3R1 | 250 | 1,210,750 | 1,210 | 0.8387 | 0.0008387 | +3803.22% | +38.46% | 54m 10s | 16m 40s |
| Wallet V3R2 | 250 | 1,230,000 | 1,230 | 0.8464 | 0.0008464 | +3867.74% | +39.73% | 54m 10s | 16m 40s |
| Wallet V4R2 | 250 | 1,308,500 | 1,308 | 0.8778 | 0.0008778 | +4119.35% | +44.91% | 54m 10s | 16m 40s |
| **Wallet V5R1** ✅ | 4 | 733,888 | 733 | 0.6057152 | 0.000605715 | +2264.51% | **Best** | 52s | 16s |
| **Highload Wallet V3**  | 4 | 31,689 | 31 | 0.638322 | 0.000638322 | **Best** | +5.38% | 13s | 4s |

## Run 9: 1 messages, Body: Jetton

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Wallet V2R1** ✅ | 1 | 2,769 | 2,769 | 0.0021012 | 0.0021012 | **Best** | **Best** | 13s | 4s |
| Wallet V2R2 | 1 | 2,846 | 2,846 | 0.002132 | 0.002132 | +2.78% | +1.46% | 13s | 4s |
| Wallet V3R1 | 1 | 2,917 | 2,917 | 0.0021604 | 0.0021604 | +5.34% | +2.81% | 13s | 4s |
| Wallet V3R2 | 1 | 2,994 | 2,994 | 0.002191201 | 0.002191201 | +8.12% | +4.28% | 13s | 4s |
| Wallet V4R2 | 1 | 3,308 | 3,308 | 0.0023168 | 0.0023168 | +19.46% | +10.26% | 13s | 4s |
| Wallet V5R1 | 1 | 4,939 | 4,939 | 0.0030652 | 0.0030652 | +78.36% | +45.87% | 13s | 4s |
| Highload Wallet V3 | 1 | 7,956 | 7,956 | 0.0056932 | 0.0056932 | +187.32% | +170.94% | 13s | 4s |

## Run 10: 4 messages, Body: Jetton

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Wallet V2R1** ✅ | 1 | 4,695 | 1,173 | 0.0046524 | 0.0011631 | **Best** | **Best** | 13s | 4s |
| Wallet V2R2 | 1 | 4,772 | 1,193 | 0.0046832 | 0.0011708 | +1.70% | +0.66% | 13s | 4s |
| Wallet V3R1 | 1 | 4,843 | 1,210 | 0.0047116 | 0.0011779 | +3.15% | +1.27% | 13s | 4s |
| Wallet V3R2 | 1 | 4,920 | 1,230 | 0.004742401 | 0.0011856 | +4.85% | +1.93% | 13s | 4s |
| Wallet V4R2 | 1 | 5,234 | 1,308 | 0.004868 | 0.001217 | +11.50% | +4.63% | 13s | 4s |
| Wallet V5R1 | 1 | 7,090 | 1,772 | 0.0058744 | 0.0014686 | +51.06% | +26.26% | 13s | 4s |
| Highload Wallet V3 | 1 | 7,956 | 1,989 | 0.0095908 | 0.0023977 | +69.56% | +106.14% | 13s | 4s |

## Run 11: 200 messages, Body: Jetton

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wallet V2R1 | 50 | 234,750 | 1,173 | 0.23262 | 0.0011631 | +2907.69% | +22.81% | 10m 50s | 3m 20s |
| Wallet V2R2 | 50 | 238,600 | 1,193 | 0.23416 | 0.0011708 | +2958.97% | +23.62% | 10m 50s | 3m 20s |
| Wallet V3R1 | 50 | 242,150 | 1,210 | 0.23558 | 0.0011779 | +3002.56% | +24.37% | 10m 50s | 3m 20s |
| Wallet V3R2 | 50 | 246,000 | 1,230 | 0.23712 | 0.0011856 | +3053.84% | +25.18% | 10m 50s | 3m 20s |
| Wallet V4R2 | 50 | 261,700 | 1,308 | 0.2434 | 0.001217 | +3253.84% | +28.50% | 10m 50s | 3m 20s |
| **Wallet V5R1** ✅ | 1 | 147,622 | 738 | 0.1894088 | 0.000947044 | +1792.30% | **Best** | 13s | 4s |
| **Highload Wallet V3**  | 1 | 7,956 | 39 | 0.264234 | 0.00132117 | **Best** | +39.50% | 13s | 4s |

## Run 12: 1000 messages, Body: Jetton

| Wallet Version | Requests | Total Gas | Gas per Msg | Total Fee (TON) | Fee per Msg (TON) | Gas delta (%) | Fee delta (%) | Real Time (sec) | Theoretical Time (sec) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wallet V2R1 | 250 | 1,173,750 | 1,173 | 1.1631 | 0.0011631 | +3683.87% | +23.09% | 54m 10s | 16m 40s |
| Wallet V2R2 | 250 | 1,193,000 | 1,193 | 1.1708 | 0.0011708 | +3748.38% | +23.90% | 54m 10s | 16m 40s |
| Wallet V3R1 | 250 | 1,210,750 | 1,210 | 1.1779 | 0.0011779 | +3803.22% | +24.65% | 54m 10s | 16m 40s |
| Wallet V3R2 | 250 | 1,230,000 | 1,230 | 1.18560025 | 0.0011856 | +3867.74% | +25.47% | 54m 10s | 16m 40s |
| Wallet V4R2 | 250 | 1,308,500 | 1,308 | 1.217 | 0.001217 | +4119.35% | +28.79% | 54m 10s | 16m 40s |
| **Wallet V5R1** ✅ | 4 | 733,888 | 733 | 0.944915201 | 0.000944915 | +2264.51% | **Best** | 52s | 16s |
| **Highload Wallet V3**  | 4 | 31,689 | 31 | 1.316722 | 0.001316722 | **Best** | +39.34% | 13s | 4s |
