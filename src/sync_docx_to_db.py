import zipfile
import xml.etree.ElementTree as ET
import glob
import os
import json
import urllib.request

def extract_clean_paragraphs(filepath):
    with zipfile.ZipFile(filepath) as z:
        xml_content = z.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        paras = []
        for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
            texts = [node.text for node in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text]
            if texts:
                text = ''.join(texts).strip()
                if text:
                    paras.append(text)
        return paras

def process_file(filepath):
    filename = os.path.basename(filepath)
    raw_paras = extract_clean_paragraphs(filepath)
    
    # Metadata identification
    title = ""
    author = "NGF Secretariat"
    date = ""
    
    if "Digital Tax Reforms" in filename:
        title = "How digital tax reforms can transform Nigeria’s revenue challenges into fiscal successes"
        author = "Karminder Malhotra & David Nabena"
        date = "October 2025"
        slug = "how-digital-tax-reforms-can-qtmwg"
    elif "Digital PFM in Action" in filename:
        title = "Digital PFM in Action: Building Resilient and Inclusive Fiscal Systems for State Governments"
        author = "NGF Secretariat"
        date = "March 2026"
        slug = "digital-pfm-in-action-building-v972u"
    elif "Digitalising Revenue Administration" in filename:
        title = "Digitalising Revenue Administration: Lessons for Nigeria"
        author = "NGF Secretariat"
        date = "April 2026"
        slug = "digitalising-revenue"
    elif "Iran War" in filename:
        title = "The Iran War: Impact of Rising Crude Oil Prices on Nigeria’s Mineral Revenue"
        author = "NGF Secretariat"
        date = "March 2026"
        slug = "iran-war-oil"
    else:
        return None

    # Exclude headers and footers
    skip_headers = [title.lower(), author.lower(), date.lower(), 'march 2026', 'april 2026', 'october 2025', 'karminder malhotra & david nabena']
    skip_footers = [
        'the secretariat', '49/51', 'lake chad crescent', 'maitama, abuja',
        '02092920025', '02092920026', 'publicfinance@ngf.org.ng', 'www.ngf.org.ng',
        '________________________________________', '___________________________________'
    ]

    body_paras = []
    for p in raw_paras:
        p_lower = p.lower()
        if any(hdr in p_lower for hdr in skip_headers) and len(p) < 150:
            continue
        if any(ftr in p_lower for ftr in skip_footers):
            continue
        body_paras.append(p)

    # Build HTML body
    html_paragraphs = []
    for p in body_paras:
        if p.startswith("Figure ") or p.startswith("figure "):
            html_paragraphs.append(f'<p className="font-semibold text-sm text-gray-500 my-4 text-center"><em>{p}</em></p>')
        elif p.startswith("1. ") or p.startswith("2. ") or p.startswith("3. ") or p.startswith("4. ") or p.startswith("5. "):
            html_paragraphs.append(f'<h3 className="text-xl font-bold text-[#08542b] mt-6 mb-3">{p}</h3>')
        elif p.startswith("•") or p.startswith("- "):
            clean_li = p.lstrip("•- ").strip()
            html_paragraphs.append(f'<ul className="list-disc pl-6 my-3"><li>{clean_li}</li></ul>')
        else:
            html_paragraphs.append(f'<p className="mb-4 text-gray-700 leading-relaxed">{p}</p>')

    content = "".join(html_paragraphs)
    excerpt = body_paras[0] if body_paras else title

    return {
        "slug": slug,
        "title": title,
        "author": author,
        "date": date,
        "excerpt": excerpt,
        "content": content,
    }

print("Parsing 4 DOCX files...")
docs = []
for filepath in sorted(glob.glob('/Users/devclassik/Documents/NGF/pfm-backend-nestjs/*.docx')):
    if 'profile' in filepath.lower(): continue
    item = process_file(filepath)
    if item:
        docs.append(item)
        print(f"Parsed: {item['title']} | Author: {item['author']} | Date: {item['date']}")

with open('/Users/devclassik/Documents/NGF/pfm-backend-nestjs/src/parsed_blogs.json', 'w') as f:
    json.dump(docs, f, indent=2)

print("Saved parsed_blogs.json successfully.")
