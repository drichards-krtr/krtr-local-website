"""Generate private, repeatable NRCS import SQL from the Assignment Desk workbook."""

import argparse
from collections import Counter
from datetime import datetime, timedelta
import json
from pathlib import Path, PurePosixPath
import re
from xml.etree import ElementTree
from zipfile import ZipFile


def workbook_rows(path):
    # XLSM stores ordinary worksheet values as XML. Never load or execute its macros.
    with ZipFile(path) as book:
        def xml(name):
            return ElementTree.fromstring(book.read(name))

        def text(node):
            return "".join(tag.text or "" for tag in node.findall(".//{*}t"))

        strings = (
            [text(item) for item in xml("xl/sharedStrings.xml")]
            if "xl/sharedStrings.xml" in book.namelist() else []
        )
        relationships = {
            rel.get("Id"): rel.get("Target")
            for rel in xml("xl/_rels/workbook.xml.rels")
        }
        for sheet in xml("xl/workbook.xml").findall(".//{*}sheet"):
            name = sheet.get("name")
            if name not in {"Assignment Desk", "Radar"}:
                continue
            rel_id = next(value for key, value in sheet.attrib.items() if key.endswith("}id"))
            target = relationships[rel_id]
            worksheet_path = target.lstrip("/") if target.startswith("/") else str(PurePosixPath("xl", target))
            rows = {}
            for row in xml(worksheet_path).findall(".//{*}row"):
                cells = {}
                for cell in row.findall("{*}c"):
                    value = cell.findtext("{*}v")
                    if cell.get("t") == "inlineStr":
                        value = text(cell)
                    if value is None or value == "":
                        continue
                    if cell.get("t") == "s":
                        value = strings[int(value)]
                    cells[cell.get("r").rstrip("0123456789")] = value
                if cells:
                    rows[int(row.get("r"))] = cells
            yield name, rows


def sql_string(value):
    # The PostgreSQL standard-string setting is explicit in the transaction.
    return "'" + value.replace("'", "''") + "'"


def readable_date(value):
    if not re.fullmatch(r"\d{5}(?:\.\d+)?", value):
        return value
    moment = datetime(1899, 12, 30) + timedelta(seconds=round(float(value) * 86400))
    return moment.isoformat(sep=" ", timespec="minutes") if moment.time() != datetime.min.time() else moment.date().isoformat()


def import_sql(path, district):
    sheets = dict(workbook_rows(path))
    if set(sheets) != {"Assignment Desk", "Radar"}:
        raise ValueError("Expected Assignment Desk and Radar worksheets")

    statements = ["begin;", "set local standard_conforming_strings = on;"]
    counts = Counter()
    decisions = {"do": "legacy_do", "skip": "skip", "too late": "skip", "hold": "hold", "need more info": "need_more_info", "": "pending"}
    for name, rows in sheets.items():
        radar = name == "Radar"
        header_row = 4 if radar else 3
        headers = rows[header_row]
        if headers.get("A") != ("Item" if radar else "Candidate / Slug"):
            raise ValueError(f"Unexpected header in {name}")
        for number, cells in rows.items():
            if number <= header_row:
                continue
            title = cells.get("A", "").strip()
            if not title:
                raise ValueError(f"Missing title in {name} row {number}")
            if radar and title.startswith("EXAMPLE") and cells.get("O") == "Delete example.":
                continue
            original = {"Workbook row": number}
            for column, value in cells.items():
                original[headers.get(column, column)] = value
            date_columns = {"E"} if radar else {"E", "L", "M"}
            for column in date_columns & cells.keys():
                value = cells[column]
                if readable_date(value) != value:
                    original[f"{headers[column]} (local)"] = readable_date(value)
            detail_columns = ("D", "E", "F", "G", "H", "I", "J", "N", "O") if radar else ("B", "C", "D", "F", "I", "J", "K", "L")
            details = "\n".join(
                f"{headers[column]} — {readable_date(cells[column]) if column in date_columns else cells[column]}"
                for column in detail_columns if column in cells
            )
            table = "nrcs_radar" if radar else "nrcs_assignments"
            columns = ["district_key", "title", "details", "legacy_key", "legacy_row"]
            values = [district, title, details, f"assignment-desk-xlsm-v1:{district}:{name}:{number:04}", json.dumps(original, ensure_ascii=False)]
            if not radar:
                old_decision = cells.get("G", "").strip().lower()
                decision = "legacy_conditional" if old_decision.startswith("do -") else decisions.get(old_decision, "pending")
                columns += ["decision", "decision_note"]
                values += [decision, cells.get("H", "")]
            statements.append(
                f"insert into public.{table} ({', '.join(columns)}) values "
                f"({', '.join(map(sql_string, values))}) on conflict (legacy_key) do nothing;"
            )
            counts[name] += 1
    statements.append("commit;")
    return "\n".join(statements) + "\n", counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("output", type=Path, help="Private SQL output path. Keep the output out of version control.")
    parser.add_argument("--district", default="dlpc")
    args = parser.parse_args()
    sql, counts = import_sql(args.workbook, args.district)
    args.output.write_text(sql, encoding="utf-8")
    print(", ".join(f"{count} {sheet} entries" for sheet, count in counts.items()))
