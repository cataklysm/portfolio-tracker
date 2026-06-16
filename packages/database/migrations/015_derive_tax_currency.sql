-- Tax currency is a property of tax residence, not a user preference.
-- Germany's tax currency is EUR, so remove the redundant editable field and
-- discard previously saved copies.

UPDATE portfolio.tax_rules
SET user_settings_schema = jsonb_set(
    jsonb_set(user_settings_schema, '{version}', '2'::jsonb),
    '{fields}',
    (
        SELECT jsonb_agg(field ORDER BY (field->>'order')::integer)
        FROM jsonb_array_elements(user_settings_schema->'fields') AS field
        WHERE field->>'key' <> 'taxCurrency'
    )
)
WHERE country_code = 'DE'
  AND user_settings_schema->>'schemaKey' = 'de_user_tax_settings';

UPDATE portfolio.user_tax_settings
SET settings = settings - 'taxCurrency',
    updated_at = now()
WHERE settings ? 'taxCurrency';
