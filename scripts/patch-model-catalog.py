"""Patch only the known host catalog; leave Deck's separate client overlay intact."""
import hashlib
import pathlib
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
CURRENT_BASELINE = '16ecb48f33996efe72868f1603223214430634c5ac4c3e8fe9060bf240e990ff'
BASELINE = 'e8c43c85ce89710df30db8104ff98822edced90fca645956a8a8bce6da7ea2a7'


def patch(source):
    assert hashlib.sha256(source).hexdigest() in (BASELINE, CURRENT_BASELINE), 'Unknown model catalog baseline'
    text = source.decode()
    marker = 'async function buildModelCatalog(ctx, defaultSelection = ctx.agentDefaultModel.currentSelection()) {'
    assert text.count(marker) == 1
    helper = (ROOT / 'scripts/lib/model_catalog_filter.js').read_text()
    # Cordis enforces service dependencies at runtime. A plain-object unit
    # fixture cannot catch an undeclared ctx.settings access.
    inject = '\t\tstatic inject = [\n\t\t\t"agentDefaultModel",'
    assert text.count(inject) == 1
    text = text.replace(inject, '\t\tstatic inject = [\n\t\t\t"settings",\n\t\t\t"credentials",\n\t\t\t"agentDefaultModel",')
    text = text.replace(marker, helper + '\n' + marker + '''
    const androidDeclarations = ctx.llm.listConfigurableProviders();
    const androidNamespaces = ctx.settings.describe({ redactSecrets: true });''')
    old = '\t\t\tconst models = await ctx.llm.listModels(provider.id);'
    assert text.count(old) == 1
    text = text.replace(old, '''            if (!await androidModelProviderConfigured(ctx, provider.id, androidDeclarations, androidNamespaces)) {
                return { kind: "unconfigured" };
            }
''' + old)
    return text


if __name__ == '__main__':
    source = ROOT / 'android-shell/app/src/main/assets/snapshot.tar.xz'
    member_name = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js'
    raw = None
    with tarfile.open(source, 'r|xz') as archive:
        for member in archive:
            if member.name.removeprefix('./') == member_name:
                raw = archive.extractfile(member).read()
                break
    assert raw is not None, 'Missing model catalog source in snapshot'
    output = ROOT / 'android-shell/app/src/main/assets/patched/model-catalog-host.js'
    output.write_text(patch(raw))
    print('Model catalog patch:', hashlib.sha256(output.read_bytes()).hexdigest())
