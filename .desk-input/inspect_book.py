from zipfile import ZipFile
from xml.etree import ElementTree as ET
z=ZipFile('.desk-input/Assignment Desk.xlsm')
def xml(n): return ET.fromstring(z.read(n))
def txt(n): return ''.join(t.text or '' for t in n.findall('.//{*}t'))
ss=[txt(n) for n in xml('xl/sharedStrings.xml')]
rels={n.attrib['Id']:n.attrib['Target'].lstrip('/') for n in xml('xl/_rels/workbook.xml.rels')}
def sheets():
 for s in xml('xl/workbook.xml').findall('.//{*}sheet'):
  path=rels[next(v for k,v in s.attrib.items() if k.endswith('}id'))]
  rows=[]
  for row in xml(path if path.startswith('xl/') else 'xl/'+path).findall('.//{*}row'):
   cells={}
   for c in row:
    v=c.findtext('{*}v')
    if c.get('t')=='inlineStr': v=txt(c)
    if v is not None and v!='':
     cells[c.get('r').rstrip('0123456789')]=ss[int(v)] if c.get('t')=='s' else v
   if cells: rows.append((int(row.get('r')),cells))
  yield s.get('name'),rows
if __name__=='__main__':
 from collections import Counter
 for name,rows in sheets():
  print(name,len(rows),rows[:2], 'decision samples', {col:Counter(r.get(col,'') for _,r in rows[1:]).most_common(8) for col,title in rows[0][1].items() if 'status' in title.lower() or 'decision' in title.lower()})

