import sqlite3,sys

with sqlite3.connect(sys.argv[1],timeout=30) as db:
    existing={row[1] for row in db.execute('PRAGMA table_info(MarketProduct)')}
    for name,definition in [
        ('imagesJson',"TEXT NOT NULL DEFAULT '[]'"),
        ('specsJson',"TEXT NOT NULL DEFAULT '{}'"),
        ('compareAtPrice','INTEGER NOT NULL DEFAULT 0'),
    ]:
        if name not in existing:
            db.execute(f'ALTER TABLE MarketProduct ADD COLUMN {name} {definition}')
    db.commit()
print('Product detail fields ready')
