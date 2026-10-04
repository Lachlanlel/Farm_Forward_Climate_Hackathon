"""Build the bundled local repository from the official SCIP export.
Requires pyshp + shapely. Raw downloads and their checksums are retained.
Geometry is generalised by <=0.0001 degrees for packaging; lookup rejects points
within 0.0002 degrees (~22m) of these boundaries rather than guessing a parish.
"""
from pathlib import Path
import shapefile, zipfile, io, json, csv, gzip, base64, hashlib
from shapely.geometry import Polygon
root=Path(__file__).resolve().parents[1]
raw=root/'src/backend/data/raw'
z=zipfile.ZipFile(raw/'20260831_GISlayers.zip')
r=shapefile.Reader(shp=io.BytesIO(z.read('edis_20260831.shp')),dbf=io.BytesIO(z.read('edis_20260831.dbf')),shx=io.BytesIO(z.read('edis_20260831.shx')))
phases={int(x['value']):x['category'] for x in csv.DictReader((raw/'CDI_RGB_HEXtable.csv').open())}
records={x['parishdpno']:x for x in csv.DictReader((raw/'20260831_edisbyParish.csv').open())}
def encode(values):
 out=[]; previous=[0,0]
 for point in values:
  for k,v in enumerate(point):
   n=round(v*10**7); delta=n-previous[k];previous[k]=n
   v=delta*2 if delta>=0 else -delta*2-1
   while v>=32: out.append(chr((32|(v&31))+63));v>>=5
   out.append(chr(v+63))
 return ''.join(out)
areas=[]
for sr in r.iterShapeRecords():
 rec=sr.record.as_dict();shape=sr.shape;key=str(rec['parishdpno']);row=records.get(key)
 if row is None: raise ValueError('Unmatched parish: '+key)
 rings=[];parts=list(shape.parts)+[len(shape.points)]
 for a,b in zip(parts,parts[1:]):
  simplified=Polygon(shape.points[a:b]).simplify(.0001,preserve_topology=True)
  rings.append(encode(simplified.exterior.coords))
 values={name:float(row[col]) if row[col].strip() not in ['', 'NA', 'NaN'] else None for name,col in [('rainfallIndex','RI'),('soilWaterIndex','SWI'),('plantGrowthIndex','PGI'),('droughtDirectionIndex','DDI')]}
 areas.append({'id':key,'bbox':list(shape.bbox),'rings':rings,'parish':row['PARISH'],'county':row['COUNTY'],'cdiPhase':phases.get(int(row['CDI'])) ,**values})
source={'provider':'NSW DPIRD','dataset':'NSW Combined Drought Indicator / EDIS II — monthly parish snapshot','url':'https://edis.spaceport.intersect.org.au/','downloadUrl':'https://edis.spaceport.intersect.org.au/%2FMonthlySnapshot%2FParish%2Fcsv%2F20260831_edisbyParish?download','geometryUrl':'https://edis.spaceport.intersect.org.au/%2FMonthlySnapshot%2FParish%2FGIS%2F20260831_GISlayers.zip?download','downloadedAt':'2026-10-04','snapshotDate':'2026-08-31','official':True,'license':'CC BY-NC 4.0','attribution':'Data provided by Climate Branch, NSW Department of Primary Industries and Regional Development on 4 October 2026. EDIS II incorporates third-party data, including ANUClimate. See the portal for full acknowledgements.','crs':'GDA94 geographic (EPSG:4283)','coordinatePrecision':7,'boundaryToleranceDegrees':0.0002,'geometryProcessing':'Rings generalised by at most 0.0001 degrees; locations within 0.0002 degrees of a boundary are unavailable pending higher-precision resolution.','checksums':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in raw.iterdir() if p.is_file()}}
repository={'schemaVersion':1,'snapshots':[{'snapshotDate':'2026-08-31','source':source,'areas':areas}]}
path=root/'src/backend/data/cdi-repository.json';path.write_text(json.dumps(repository,separators=(',',':')))
print('Parishes:',len(areas),'JSON bytes:',path.stat().st_size,'gzip bytes:',len(gzip.compress(path.read_bytes())))
