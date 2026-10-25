"""Validate release metadata and the actual archives; never contacts a registry."""
import argparse
import email
import json
from pathlib import Path
import re
import tarfile
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument('ecosystem', choices=['npm', 'python'])
p.add_argument('--publishing', action='store_true')
args = p.parse_args()

def check(ok, message):
    if not ok:
        raise SystemExit(message)

def version(v):
    check(bool(re.fullmatch(r'\d+\.\d+\.\d+', v)), 'Use a stable X.Y.Z version (prereleases need a separate release policy).')

def license_check(value, files):
    if args.publishing:
        check(isinstance(value, str) and value not in ('', 'UNLICENSED'), 'Publishing blocked: settle the license and set explicit package license metadata first; see docs/package-publishing.md.')
        check(any(Path(f).name.startswith('LICENSE') for f in files), 'Publishing blocked: include the approved LICENSE file in the archive.')
    print(f'License metadata: {value or "UNRESOLVED"}')

if args.ecosystem == 'npm':
    sdk = json.loads((ROOT / 'packages/sdk-js/package.json').read_text())
    cli = json.loads((ROOT / 'packages/cli/package.json').read_text())
    check(cli['dependencies']['@guidon/sdk'] in (sdk['version'], '^' + sdk['version'], '~' + sdk['version']), 'CLI SDK dependency must reference the SDK version in this checkout.')
    check(f'"{sdk["version"]}"' in (ROOT / 'packages/sdk-js/src/version.ts').read_text(), 'SDK runtime version differs from package.json')
    for folder, name, required in [('sdk-js', '@guidon/sdk', ['dist/index.js', 'dist/index.d.ts']), ('cli', 'guidon-cli', ['dist/bin.js', 'dist/cli.js'])]:
        source = json.loads((ROOT / f'packages/{folder}/package.json').read_text())
        check(source['name'] == name and not source.get('private'), f'Unexpected package identity: {name}')
        version(source['version'])
        check(source['repository']['url'] == 'git+https://github.com/Two-Steps-Studio/guidon.git', 'Repository must match npm provenance identity')
        for spec in source.get('dependencies', {}).values():
            check(not spec.startswith(('file:', 'link:', 'workspace:')), 'Local dependencies cannot be published')
        archives = list((ROOT / f'artifacts/{folder}').glob('*.tgz'))
        check(len(archives) == 1, f'Expected exactly one {folder} archive')
        with tarfile.open(archives[0]) as archive:
            names = archive.getnames()
            packed = json.load(archive.extractfile('package/package.json'))
            check(packed == source, 'Packed metadata differs from source')
            for entry in ['README.md', *required]:
                check('package/' + entry in names, f'Missing {entry} in {name}')
            check(not any('/node_modules/' in n or n.endswith(('.env', '.npmrc')) for n in names), 'Unexpected private/config files')
            license_check(packed.get('license'), names)
        print(f'Validated {name}@{source["version"]}: {archives[0].name}')
else:
    source = tomllib.loads((ROOT / 'sdk/python/pyproject.toml').read_text())['project']
    check(source['name'] == 'guidon-sdk', 'Unexpected PyPI name')
    version(source['version'])
    check(f'"{source["version"]}"' in (ROOT / 'sdk/python/src/guidon/_version.py').read_text(), 'Python runtime version differs from pyproject.toml')
    wheels = list((ROOT / 'artifacts/python').glob('*.whl'))
    sdists = list((ROOT / 'artifacts/python').glob('*.tar.gz'))
    check(len(wheels) == len(sdists) == 1, 'Expected one wheel and one sdist')
    with zipfile.ZipFile(wheels[0]) as wheel:
        names = wheel.namelist()
        for entry in ['guidon/__init__.py', 'guidon/client.py', 'guidon/py.typed']:
            check(entry in names, f'Wheel missing {entry}')
        metadata = email.message_from_bytes(wheel.read(next(n for n in names if n.endswith('/METADATA'))))
        check(metadata['Name'] == source['name'] and metadata['Version'] == source['version'], 'Wheel metadata mismatch')
        if args.publishing:
            check(metadata['License-Expression'] == source.get('license'), 'Wheel must publish the approved SPDX License-Expression.')
            check('LICENSE' in (metadata.get_all('License-File') or []), 'Wheel must declare its LICENSE file.')
        license_check(source.get('license'), names)
    with tarfile.open(sdists[0]) as sdist:
        names = sdist.getnames()
        check(any(n.endswith('/src/guidon/py.typed') for n in names), 'sdist missing typed package')
        metadata = email.message_from_bytes(sdist.extractfile(next(n for n in names if n.endswith('/PKG-INFO'))).read())
        check(metadata['Name'] == source['name'] and metadata['Version'] == source['version'], 'sdist metadata mismatch')
        if args.publishing:
            check(metadata['License-Expression'] == source.get('license'), 'sdist must publish the approved SPDX License-Expression.')
            check('LICENSE' in (metadata.get_all('License-File') or []), 'sdist must declare its LICENSE file.')
        license_check(source.get('license'), names)
    print(f'Validated guidon-sdk@{source["version"]}: wheel and sdist')
