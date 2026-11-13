//! Lists the font families installed on this computer, for the font pickers in the settings.

use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct FontFamily {
    /// Family name to use in CSS (the English name when the font has one).
    pub name: String,
    /// Name to show: the Japanese family name when the font has one, otherwise `name`.
    pub label: String,
    /// True when at least one face of the family is fixed-pitch.
    pub monospace: bool,
}

/// Families found in `db`, without duplicates, sorted by name ignoring case.
pub fn families(db: &fontdb::Database) -> Vec<FontFamily> {
    let mut found: BTreeMap<String, FontFamily> = BTreeMap::new();
    for face in db.faces() {
        // fontdb puts the English (US) name first when the font has one.
        let Some((name, _)) = face.families.first() else {
            continue;
        };
        // Names starting with a dot are system-internal fonts (macOS) that CSS cannot select;
        // emoji fonts have no letters to write text with.
        if name.is_empty() || name.starts_with('.') || name.to_lowercase().contains("emoji") {
            continue;
        }
        let label = face
            .families
            .iter()
            .find(|(_, lang)| *lang == fontdb::Language::Japanese_Japan)
            .map(|(n, _)| n.clone())
            .unwrap_or_else(|| name.clone());
        let entry = found.entry(name.to_lowercase()).or_insert(FontFamily {
            name: name.clone(),
            label,
            monospace: false,
        });
        entry.monospace |= face.monospaced;
    }
    found.into_values().collect()
}

#[tauri::command]
pub async fn list_fonts() -> Vec<FontFamily> {
    // Scanning the font folders touches a few hundred files; keep it off the main thread.
    tauri::async_runtime::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        families(&db)
    })
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_families_are_unique_and_sorted() {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        let list = families(&db);
        let keys: Vec<String> = list.iter().map(|f| f.name.to_lowercase()).collect();
        let mut sorted = keys.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(keys, sorted);
        assert!(
            list.iter()
                .all(|f| !f.name.starts_with('.') && !f.label.is_empty())
        );
    }
}
