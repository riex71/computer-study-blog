"""Check both artifacts, optionally the deployed public runtime, before a Worker release."""
from pathlib import Path
import argparse,json,urllib.request
ROOT=Path(__file__).resolve().parent.parent
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--public-url');args=parser.parse_args()
    private=json.loads((ROOT/'admin/dist/runtime.json').read_text())
    public=json.loads((ROOT/'_site/runtime.json').read_text())
    assert private==public,'Public and private build contracts differ'
    if args.public_url:
        request=urllib.request.Request(args.public_url.rstrip('/')+'/runtime.json?v='+private['runtime'],headers={'User-Agent':'StudybaseRelease/1.0','Cache-Control':'no-cache'})
        with urllib.request.urlopen(request,timeout=30) as response:deployed=json.load(response)
        assert deployed==private,'Deploy the matching public build before releasing the editor'
    print('Public and private runtime contracts match: '+private['runtime'][:12])
