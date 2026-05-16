import torch
from asd.talkNetModel import talkNetModel


def load_talknet(weights_path: str, device: str = "cpu") -> torch.nn.Module:
    """
    Loads pretrain_TalkSet.model weights into talkNetModel.
    Weights were saved from the talkNet wrapper, so keys have a 'model.' prefix
    which we strip here before loading into talkNetModel directly.
    """
    model = talkNetModel()
    raw = torch.load(weights_path, map_location=device)
    # Strip 'model.' prefix and drop loss/optim keys
    state = {k[len("model."):]: v for k, v in raw.items() if k.startswith("model.")}
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model
