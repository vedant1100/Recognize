import torch
import torch.nn as nn

from asd.audioEncoder import audioEncoder
from asd.visualEncoder import visualFrontend, visualTCN, visualConv1D
from asd.attentionLayer import attentionLayer


class talkNetModel(nn.Module):
    def __init__(self):
        super(talkNetModel, self).__init__()
        self.visualFrontend = visualFrontend()
        self.visualTCN = visualTCN()
        self.visualConv1D = visualConv1D()
        self.audioEncoder = audioEncoder(layers=[3, 4, 6, 3], num_filters=[16, 32, 64, 128])
        self.crossA2V = attentionLayer(d_model=128, nhead=8)
        self.crossV2A = attentionLayer(d_model=128, nhead=8)
        self.selfAV = attentionLayer(d_model=256, nhead=8)

    def forward_visual_frontend(self, x):
        # x: (B, T, 112, 112) — raw uint8 float values, model normalizes internally
        B, T, W, H = x.shape
        x = x.view(B * T, 1, 1, W, H)
        x = (x / 255 - 0.4161) / 0.1688
        x = self.visualFrontend(x)
        x = x.view(B, T, 512)
        x = x.transpose(1, 2)
        x = self.visualTCN(x)
        x = self.visualConv1D(x)
        x = x.transpose(1, 2)
        return x

    def forward_audio_frontend(self, x):
        # x: (B, T, F) — MFCC features, shape (1, 100, 13)
        x = x.unsqueeze(1).transpose(2, 3)
        x = self.audioEncoder(x)
        return x

    def forward_cross_attention(self, x1, x2):
        x1_c = self.crossA2V(src=x1, tar=x2)
        x2_c = self.crossV2A(src=x2, tar=x1)
        return x1_c, x2_c

    def forward_audio_visual_backend(self, x1, x2):
        x = torch.cat((x1, x2), 2)
        x = self.selfAV(src=x, tar=x)
        x = torch.reshape(x, (-1, 256))
        return x
