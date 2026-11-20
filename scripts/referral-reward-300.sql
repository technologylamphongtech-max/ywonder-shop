-- Change the displayed task reward only; existing balances and past rewards stay unchanged.
UPDATE MarketTaskDefinition SET reward=300 WHERE key='invite_friend';
