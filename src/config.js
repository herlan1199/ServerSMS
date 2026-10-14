require('dotenv').config();

module.exports = {
    port: parseInt(process.env.PORT || '3000'),

    jwt: {
        secret: process.env.JWT_SECRET,
        accessExpires: process.env.JWT_EXPIRES || '30m',
        refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d',
    },

    economy: {
        initialTokens: parseInt(process.env.INITIAL_TOKENS),
        battleCommission: parseFloat(process.env.BATTLE_COMMISSION),
        maintenanceCostPerBattle: parseInt(process.env.MAINTENANCE_COST_PER_BATTLE),
        pityThreshold: parseInt(process.env.PITY_THRESHOLD),
        upgrades: {
            attack: {
                cost: parseInt(process.env.UPGRADE_COST_ATTACK),
                baseGain: parseInt(process.env.UPGRADE_BASE_ATTACK),
                max: parseInt(process.env.UPGRADE_MAX_ATTACK),
            },
            defense: {
                cost: parseInt(process.env.UPGRADE_COST_DEFENSE),
                baseGain: parseInt(process.env.UPGRADE_BASE_DEFENSE),
                max: parseInt(process.env.UPGRADE_MAX_DEFENSE),
            },
            health: {
                cost: parseInt(process.env.UPGRADE_COST_HEALTH),
                baseGain: parseInt(process.env.UPGRADE_BASE_HEALTH),
                max: parseInt(process.env.UPGRADE_MAX_HEALTH),
            },
        },
        bonusChance: {
            critical: 0.01,
            double: 0.09,
            half: 0.20,
        },
        dailyReward: 50,
    },
};
