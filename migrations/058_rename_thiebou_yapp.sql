UPDATE public.dishes
SET name_en = 'Thiébou Yapp', name_fr = 'Thiébou Yapp', name_nl = 'Thiébou Yapp',
    updated_at = NOW()
WHERE dish_key = 'ceebu_yapp';

INSERT INTO public.dish_aliases (dish_id, alias, normalized_alias, language)
SELECT id, 'Thiébou Yapp', 'thiebou yapp', NULL
FROM public.dishes WHERE dish_key = 'ceebu_yapp'
ON CONFLICT (normalized_alias) DO NOTHING;
