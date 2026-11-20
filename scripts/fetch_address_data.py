import json
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/v5.0.0/json/full_json_generated_data_vn_units.json'
source = json.load(urllib.request.urlopen(SOURCE))
result = []
for province in source:
    result.append({
        'code': str(province['Code']),
        'name': province['FullName'],
        'postalCodePrefix': province.get('PostalCodePrefix', ''),
        'wards': [
            {'code': str(ward['Code']), 'name': ward['FullName'], 'type': ward.get('AdministrativeUnitFullName', ''), 'postalCode': str(ward.get('PostalCode', ''))}
            for ward in province.get('Wards', [])
        ],
    })

output = Path(__file__).resolve().parents[1] / 'public' / 'data' / 'vietnam-administrative-2025.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({
    'version': '2025-08-02',
    'source': SOURCE,
    'provinces': result,
}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Wrote {len(result)} provinces and {sum(len(p["wards"]) for p in result)} wards to {output}')
