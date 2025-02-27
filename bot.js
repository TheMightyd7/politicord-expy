const config = {
    /**
     * Amount of XP rewarded when the user bumps the server successfully.
     */
    bumpXp: 25,

    /**
     * The number of characters in an average message.
     */
    xpIncreaseConstant: 200,
}

require('dotenv').config()

const Discord = require('discord.js')
const client = new Discord.Client()

const { Sequelize } = require('sequelize')

process.on('unhandledRejection', error => console.error('Uncaught Promise Rejection', error));

const sequelize = new Sequelize(process.env.DB_DATABASE, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
    dialect: process.env.DB_CONNECTION,
    host: process.env.DB_HOST,
    logging: false,
})

const BlacklistedChannel = sequelize.define('blacklisted_channels', {
    guild_id: Sequelize.BIGINT.UNSIGNED,
}, {
    timestamps: false,
})

const Guild = sequelize.define('guilds', {
    prefix: {
        type: Sequelize.STRING,
        defaultValue: '$',
    },
}, {
    timestamps: false,
})

const Member = sequelize.define('members', {
    character_carry: {
        type: Sequelize.BIGINT.UNSIGNED,
        defaultValue: 0,
    },
    guild_id: Sequelize.BIGINT.UNSIGNED,
    is_blacklisted: {
        type: Sequelize.BOOLEAN,
        defaultValue: 0,
    },
    is_member: {
        type: Sequelize.BOOLEAN,
        defaultValue: 1,
    },
    joined_voice_at: Sequelize.DATE,
    last_level_reported: {
        type: Sequelize.INTEGER.UNSIGNED,
        defaultValue: 0,
    },
    user_id: Sequelize.BIGINT.UNSIGNED,
    xp: {
        type: Sequelize.BIGINT.UNSIGNED,
        defaultValue: 0,
    },
}, {
    timestamps: false,
})

const Rank = sequelize.define('ranks', {
    guild_id: Sequelize.BIGINT.UNSIGNED,
    level: Sequelize.INTEGER.UNSIGNED,
    role_id: Sequelize.BIGINT.UNSIGNED,
}, {
    timestamps: false,
})

const Token = sequelize.define('tokens', {
    guild_id: Sequelize.BIGINT.UNSIGNED,
    key: Sequelize.STRING,
}, {
    timestamps: false,
})

const calculateLevel = (xp) => {
    return Math.floor(Math.sqrt(+xp) * 0.25)
}

const calculateXp = (level) => {
    return Math.floor(Math.pow(+level / 0.25, 2))
}

const logAbnormalXpChange = (originalXp, newXp, member, guild, message) => {
    let channel = client.channels.fetch('855656138149199903')

    channel.send(`${member} from guild ${guild.name} went from ${originalXp} to ${newXp} when ${message}.`)
}

client.on('guildMemberAdd', async (member) => {
    if (member.bot) return

    let memberToAdd = await Member.findOne({ where: { guild_id: member.guild.id, user_id: member.id }}) || await Member.create({ guild_id: member.guild.id, user_id: member.id })

    if (! memberToAdd.is_member) await memberToAdd.update({ is_member: true })

    let ranks = await Rank.findAll({ order: [['level', 'DESC']], where: { guild_id: member.guild.id } })

    if (ranks.length) {
        let level = calculateLevel(memberToAdd.xp)

        let correctRank = ranks.find((rank) => +rank.level <= level)

        ranks.forEach((rank) => {
            if (correctRank && rank.role_id === correctRank.role_id) return

            member.roles.remove(rank.role_id)
        })

        if (correctRank) member.roles.add(correctRank.role_id)
    }
})

client.on('guildMemberRemove', async (member) => {
    if (member.bot) return

    let memberToDeactivate = await Member.findOne({ where: { guild_id: member.guild.id, user_id: member.id }})

    if (memberToDeactivate && memberToDeactivate.is_member) member = await memberToDeactivate.update({ is_member: false })
})

client.on('message', async (msg) => {
    let guild = await Guild.findOne({ where: { id: msg.guild.id } }) || await Guild.create({ id: msg.guild.id })

    if (msg.webhookID) return

    if (msg.author.bot) {
        // DISBOARD
        msg.embeds
            .filter((embed) => embed.description && embed.description.toLowerCase().includes('bump done'))
            .forEach((embed) => {
                let mentions = embed.description.match(/<@!?\d{17,19}>/g)

                mentions.forEach(async (mention) => {
                    if (! mention.startsWith('<@') || ! mention.endsWith('>')) return

                    let userId = mention.slice(2, -1)

                    if (userId.startsWith('!')) userId = userId.slice(1)

                    let memberToReward = msg.guild.members.cache.find((member) => +member.id === +userId)

                    let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: userId }}) || await Member.create({ guild_id: msg.guild.id, user_id: memberToReward.id })

                    if (member.is_blacklisted) return

                    let newXp = member.xp + config.bumpXp

                    if (newXp < 0) newXp = 0

                    if (member.xp > newXp) {
                        logAbnormalXpChange(member.xp, newXp, memberToReward, msg.guild, 'they were rewarded for bumping the server')
                    }

                    await member.update({ xp: newXp })

                    msg.channel.send(`${memberToReward} Here's ${config.bumpXp} XP, for a new total of ${newXp}.`)

                    let level = calculateLevel(member.xp)

                    let ranks = await Rank.findAll({ order: [['level', 'DESC']], where: { guild_id: msg.guild.id } })

                    if (ranks.length) {
                        let correctRank = ranks.find((rank) => +rank.level <= +level)

                        ranks.forEach((rank) => {
                            if (correctRank && rank.role_id === correctRank.role_id) return

                            memberToReward.roles.remove(rank.role_id)
                        })

                        if (correctRank) memberToReward.roles.add(correctRank.role_id)
                    }

                    if (member.last_level_reported !== level) {
                        msg.guild.channels.cache.get('853497354237509664').send({
                            embed: {
                                color: 0x87CEEB,
                                description: `You just reached level ${level}.`,
                                thumbnail: {
                                    url: memberToReward.user.displayAvatarURL(),
                                },
                                timestamp: new Date(),
                                title: `Congratulations ${memberToReward.user.username}!`,
                            },
                        })
						msg.channel.send({
                            embed: {
                                color: 0x87CEEB,
                                description: `You just reached level ${level}.`,
                                thumbnail: {
                                    url: memberToReward.user.displayAvatarURL(),
                                },
                                timestamp: new Date(),
                                title: `Congratulations ${memberToReward.user.username}!`,
                            },
                        })

                        await member.update({ last_level_reported: level })
                    }
                })
            })

        // dsc.gg
        msg.embeds
            .filter((embed) => embed.title && embed.title.toLowerCase().includes('link bumped'))
            .forEach(async (embed) => {
                let channelMessages = await msg.channel.messages.fetch()

                let bumpTriggerMessage = messages.find((message) => message.content.toLowerCase().includes('>bump'))

                if (! bumpTriggerMessage) return

                let memberToReward = bumpTriggerMessage.member

                let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: userId }}) || await Member.create({ guild_id: msg.guild.id, user_id: memberToReward.id })

                if (member.is_blacklisted) return

                let newXp = member.xp + config.bumpXp

                if (newXp < 0) newXp = 0

                if (member.xp > newXp) {
                    logAbnormalXpChange(member.xp, newXp, memberToReward, msg.guild, 'they were rewarded for bumping the server')
                }

                await member.update({ xp: newXp })

                //msg.channel.send(`${memberToReward} Because you bumped, here's ${config.bumpXp} XP, for a new total of ${newXp}.`)
				
				msg.guild.channels.cache.get('853497354237509664').send({
                        embed: {
                            color: 0x87CEEB,
                            description: `You received ${config.bumpXp} XP as a reward for bumping in <#739241088744816661>.`,
                            thumbnail: {
                                url: memberToReward.user.displayAvatarURL(),
                            },
                            timestamp: new Date(),
							footer: {
								text: 'Bumping is a great way to get XP. Want to be first? Toggle bump ping with the command p!bump',
							},
                            title: `Congratulations ${memberToReward.user.username}!`,
                        },
                    })

                let level = calculateLevel(member.xp)

                let ranks = await Rank.findAll({ order: [['level', 'DESC']], where: { guild_id: msg.guild.id } })

                if (ranks.length) {
                    let correctRank = ranks.find((rank) => +rank.level <= +level)

                    ranks.forEach((rank) => {
                        if (correctRank && rank.role_id === correctRank.role_id) return

                        memberToReward.roles.remove(rank.role_id)
                    })

                    if (correctRank) memberToReward.roles.add(correctRank.role_id)
                }

                if (member.last_level_reported !== level) {
                    msg.guild.channels.cache.get('853497354237509664').send({
                        embed: {
                            color: 0x87CEEB,
                            description: `You just reached level ${level}.`,
                            thumbnail: {
                                url: memberToReward.user.displayAvatarURL(),
                            },
                            timestamp: new Date(),
                            title: `Congratulations ${memberToReward.user.username}!`,
                        },
                    })

                    await member.update({ last_level_reported: level })
                }
            })

        return
    }

    let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: msg.author.id }}) || await Member.create({ guild_id: msg.guild.id, user_id: msg.author.id })

    let channelIsBlacklisted = await BlacklistedChannel.findOne({ where: { id: msg.channel.id } })

    if (! member.is_blacklisted && ! channelIsBlacklisted) {
        let messageLengthAndCharacterCarry = msg.content.length + member.character_carry

        let xpIncrease = Math.floor(messageLengthAndCharacterCarry / config.xpIncreaseConstant)

        let newCharacterCarry = messageLengthAndCharacterCarry % config.xpIncreaseConstant
        
        let newXp = member.xp + xpIncrease

        if (member.xp > newXp) {
            logAbnormalXpChange(member.xp, newXp, msg.author, msg.guild, 'they were rewarded for a message')
        }

        await member.update({ character_carry: newCharacterCarry, xp: newXp })

        let level = calculateLevel(member.xp)

        let ranks = await Rank.findAll({ order: [['level', 'DESC']], where: { guild_id: msg.guild.id } })

        if (ranks.length) {
            let correctRank = ranks.find((rank) => +rank.level <= +level)

            ranks.forEach((rank) => {
                if (correctRank && rank.role_id === correctRank.role_id) return

                msg.member.roles.remove(rank.role_id)
            })

            if (correctRank) msg.member.roles.add(correctRank.role_id)
        }

        if (member.last_level_reported !== level) {
            msg.guild.channels.cache.get('853497354237509664').send({
                embed: {
                    color: 0x87CEEB,
                    description: `You just reached level ${level}.`,
                    thumbnail: {
                        url: msg.author.displayAvatarURL(),
                    },
                    timestamp: new Date(),
                    title: `Congratulations ${msg.author.username}!`,
                },
            })

            await member.update({ last_level_reported: level })
        }
    }

    let prefix = guild.prefix

    if (msg.content === `<@!${client.user.id}>`) return msg.reply(`this server's Expy prefix is \`${prefix}\`.`)

    if (! msg.content.startsWith(prefix)) return

    let args = msg.content.slice(prefix.length).trim().split(/ +/g)

    const command = args.shift().toLowerCase()

    if (command === 'addrank' || command === 'ar') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        if (args.length < 2) return msg.reply(`please specify a level and a role.`)

        let levelToAdd = +args[0]

        if (! Number.isInteger(levelToAdd) || levelToAdd < 0) return msg.reply(`please specify a level to create the rank for.`)

        let roleToAdd = msg.mentions.roles.first() || msg.guild.roles.cache.find((role) => +role.id === +args[1] || role.name.toLowerCase() === args[1].toLowerCase())

        if (! roleToAdd) return msg.reply(`please specify a role to create the rank for.`)

        let existingRankWithSameRole = await Rank.findOne({ where: { guild_id: msg.guild.id, role_id: roleToAdd.id }})

        if (existingRankWithSameRole) existingRankWithSameRole.destroy()

        let existingRankWithSameLevel = await Rank.findOne({ where: { guild_id: msg.guild.id, level: levelToAdd }})

        if (existingRankWithSameLevel) existingRankWithSameLevel.destroy()

        await Rank.create({ guild_id: msg.guild.id, level: levelToAdd, role_id: roleToAdd.id })

        return msg.reply(`the ${roleToAdd.name} role has been assigned to level ${levelToAdd}.`)
    }

    if (command === 'blacklist' || command === 'bl') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        if (args.length < 1) {
            let blacklistedChannels = await BlacklistedChannel.findAll({ where: { guild_id: msg.guild.id } })

            let blacklistedChannelsList = ''

            blacklistedChannels.forEach((blacklistedChannel) => {
                let channel = msg.guild.channels.cache.find((channel) => +channel.id === +blacklistedChannel.id)

                if (! channel) return

                if (blacklistedChannelsList.length) blacklistedChannelsList += ', '

                blacklistedChannelsList += `${channel}`
            })

            let blacklistedMembers = await Member.findAll({ where: { guild_id: msg.guild.id, is_blacklisted: true, is_member: true } })

            let blacklistedMembersList = ''

            blacklistedMembers.forEach((blacklistedMember) => {
                let member = msg.guild.members.cache.find((member) => +member.id === +blacklistedMember.user_id)

                if (! member) return

                if (blacklistedMembersList.length) blacklistedMembersList += ', '

                blacklistedMembersList += `${member}`
            })

            return msg.channel.send({
                embed: {
                    color: 0x87CEEB,
                    fields: [
                        {
                            name: 'Blacklisted channels',
                            value: blacklistedChannelsList !== '' ? blacklistedChannelsList : 'None',
                        },
                        {
                            name: 'Blacklisted members',
                            value: blacklistedMembersList !== '' ? blacklistedMembersList : 'None',
                        },
                    ],
                    thumbnail: {
                        url: msg.guild.iconURL(),
                    },
                    timestamp: new Date(),
                    title: `Blacklist`,
                },
            })
        }

        let memberToBlacklist = msg.mentions.members.first() || msg.guild.members.cache.find((member) => +member.id === +args[0])

        if (memberToBlacklist) {
            let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: memberToBlacklist.id }}) || await Member.create({ guild_id: msg.guild.id, user_id: memberToBlacklist.id })

            await member.update({ is_blacklisted: ! member.is_blacklisted })

            let actionDescription = member.is_blacklisted ? 'blacklisted' : 'unblacklisted'

            return msg.reply(`${memberToBlacklist} has been ${actionDescription}.`)
        }

        let channelToBlacklist = msg.mentions.channels.first() || msg.guild.channels.cache.find((channel) => +channel.id === +args[0])

        if (! channelToBlacklist) return msg.reply(`please specify a member or channel to blacklist.`)

        let blacklistedChannel = await BlacklistedChannel.findOne({ where: { id: channelToBlacklist.id }})

        let actionDescription = 'blacklisted'

        if (blacklistedChannel) {
            await blacklistedChannel.destroy()

            actionDescription = 'unblacklisted'
        }

        if (! blacklistedChannel) await BlacklistedChannel.create({ id: channelToBlacklist.id, guild_id: msg.guild.id })

        return msg.reply(`${channelToBlacklist} has been ${actionDescription}.`)
    }


    if (command === 'leaderboard' || command === 'lb') {
		
		let channel
		
		if (msg.channel.id == `874557857314529321` || msg.channel.id == '732409225984081951') { 
			channel = msg.channel
		} else {
			channel = msg.guild.channels.cache.get('874557857314529321')
			msg.reply('\<a:1984:827053202465226792> You can\'t use this command here. I\'ve sent the leaderboard to <#874557857314529321>.')
		}
		
		
        let page = +args[0]

        if (! page || ! Number.isInteger(page) || page < 1) page = 1

        const pageSize = 10

        let members = await Member.findAll({ limit: pageSize, offset: (page * pageSize) - pageSize, order: [['xp', 'DESC']], where: { guild_id: msg.guild.id, is_blacklisted: false, is_member: true } })
		let allMembers = await Member.findAll({ order: [['xp', 'DESC']], where: { guild_id: msg.guild.id, is_blacklisted: false, is_member: true } })
		
        if (! members.length) {
            page = 1

            members = await Member.findAll({ limit: pageSize, offset: (page * pageSize) - pageSize, order: [['xp', 'DESC']], where: { guild_id: msg.guild.id, is_blacklisted: false, is_member: true } })
        }

        let embedFields = []

        members.forEach((memberToAdd, index) => {
            let member = msg.guild.members.cache.find((member) => +member.id === +memberToAdd.user_id)

            if (! member) return

            let position = (page * pageSize) - pageSize + index + 1

            let level = calculateLevel(memberToAdd.xp)

            embedFields.push({
                name: `#${position} - ${member.user.tag}`,
                value: `Level ${level} - ${memberToAdd.xp} XP`,
            })
        })
		function roundNumber(rnum) { 
			var newnumber = Math.round(rnum * Math.pow(10, 0)) / Math.pow(10, 0);
			return newnumber;
		}
		let maxPages = Math.ceil((allMembers.length / 10))
		//console.log(allMembers.length)
        return channel.send({
            embed: {
                color: 0x87CEEB,
                fields: embedFields,
                thumbnail: {
                    url: msg.guild.iconURL(),
                },
                timestamp: new Date(),
                title: `Leaderboard - Page ${page}`,
				footer: {
					text: `Viewing page ${page} of ${maxPages}`,
				},
            },
        })
    }

    if (command === 'level' || command === 'rank' || command === 'xp') {
        let memberToReport = msg.mentions.members.first() || msg.guild.members.cache.find((member) => +member.id === +args[0]) || msg.member

        let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: memberToReport.id }}) || await Member.create({ guild_id: msg.guild.id, user_id: memberToReport.id })

        if (member.is_blacklisted) return msg.reply('you have been blacklisted from receiving any XP.')

        let level = calculateLevel(member.xp)

        let nextLevelXp = calculateXp(level + 1)

		let channel
		
		if (msg.channel.id == `874557857314529321` || msg.channel.id == '732409225984081951') { 
			channel = msg.channel
		} else {
			channel = msg.guild.channels.cache.get('874557857314529321')
			msg.reply('\<a:1984:827053202465226792> You can\'t use this command here. I\'ve sent your level to <#874557857314529321>.')
		}
		
        return channel.send({
            embed: {
                color: 0x87CEEB,
                description: `${member.xp} / ${nextLevelXp} XP`,
                thumbnail: {
                    url: memberToReport.user.displayAvatarURL(),
                },
                timestamp: new Date(),
                title: `${memberToReport.user.username} - Level ${level}`,
            },
        })
    }

    if (command === 'prefix') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        if (! args[0]) return msg.reply(`this server's Expy prefix is \`${prefix}\`.`)

        prefix = args[0]

        await guild.update({
            prefix: prefix,
        })

        return msg.reply(`this server's Expy prefix is now \`${prefix}\`.`)
    }

    if (command === 'ranks') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        let ranks = await Rank.findAll({ order: [['level', 'ASC']], where: { guild_id: msg.guild.id } })

        let embedFields = []

        ranks.forEach((rank) => {
            let role = msg.guild.roles.cache.find((role) => +role.id === +rank.role_id)

            if (! role) return

            embedFields.push({
                name: role.name,
                value: `Level ${rank.level}`,
            })
        })

        if (! embedFields.length) return msg.reply(`this guild does not have any ranks currently set up. You can create your first using \`${prefix}addrank <level> <role>\`.`)

        return msg.channel.send({
            embed: {
                color: 0x87CEEB,
                fields: embedFields,
                thumbnail: {
                    url: msg.guild.iconURL(),
                },
                timestamp: new Date(),
                title: `Ranks`,
            },
        })
    }

    if (command === 'reward') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        if (args.length < 2) return msg.reply(`please specify a member and the amount of XP to reward them with.`)

        let memberToReward = msg.mentions.members.first() || msg.guild.members.cache.find((member) => +member.id === +args[0])

        if (! memberToReward) return msg.reply(`please specify a member to reward.`)

        let xpChange = +args[1]

        if (! xpChange || ! Number.isInteger(xpChange) || xpChange < 1) return msg.reply(`please specify the amount of XP to reward the member with.`)

        let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: memberToReward.id }}) || await Member.create({ guild_id: msg.guild.id, user_id: memberToReward.id })

        let newXp = member.xp + xpChange

        if (newXp < 0) newXp = 0

        let newLevel = calculateLevel(newXp)

        if (member.xp > newXp) {
            logAbnormalXpChange(member.xp, newXp, memberToReward, msg.guild, 'they were rewarded')
        }

        await member.update({ last_level_reported: newLevel, xp: newXp })

        let ranks = await Rank.findAll({ order: [['level', 'DESC']], where: { guild_id: msg.guild.id } })

        if (ranks.length) {
            let correctRank = ranks.find((rank) => +rank.level <= newLevel)

            ranks.forEach((rank) => {
                if (correctRank && rank.role_id === correctRank.role_id) return

                memberToReward.roles.remove(rank.role_id)
            })

            if (correctRank) memberToReward.roles.add(correctRank.role_id)
        }

        return msg.reply(`${memberToReward} now has ${newXp} XP and is on level ${newLevel}.`)
    }

    if (command === 'removerank' || command === 'rr') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        if (args.length < 1) return msg.reply(`please specify a level or a role to remove the rank for.`)

        let levelToRemove = +args[0]

        if (Number.isInteger(levelToRemove)) {
            let rankToRemove = await Rank.findOne({ where: { guild_id: msg.guild.id, level: levelToRemove }})

            if (rankToRemove) {
                rankToRemove.destroy()

                return msg.reply(`the rank for level ${levelToRemove} has been removed.`)
            }
        }

        let roleToRemove = msg.mentions.roles.first() || msg.guild.roles.cache.find((role) => +role.id === +args[0] || role.name.toLowerCase() === args[0].toLowerCase())

        if (! roleToRemove) return msg.reply(`please specify a role to remove the rank for.`)

        let rankToRemove = await Rank.findOne({ where: { guild_id: msg.guild.id, role_id: roleToRemove.id }})

        if (rankToRemove) rankToRemove.destroy()

        return msg.reply(`the rank for ${roleToRemove.name} has been removed.`)
    }

    if (command === 'revoketoken') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        let key = args[0]

        if (! key) msg.reply('please specify a token to revoke.')

        await Token.destroy({ where: { guild_id: msg.guild.id, key: key } })

        let reply = await msg.reply(`the token \`${key}\` has been revoked.`)
    }

    if (command === 'sanction') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        if (args.length < 2) return msg.reply(`please specify a member and the amount of XP to sanction them by.`)

        let memberToSanction = msg.mentions.members.first() || msg.guild.members.cache.find((member) => +member.id === +args[0])

        if (! memberToSanction) return msg.reply(`please specify a member to sanction.`)

        let xpChange = +args[1]

        if (! xpChange || ! Number.isInteger(xpChange) || xpChange < 1) return msg.reply(`please specify the amount of XP to sanction the member by.`)

        let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: memberToSanction.id }}) || await Member.create({ guild_id: msg.guild.id, user_id: memberToSanction.id })

        let newXp = member.xp - xpChange

        if (newXp < 0) newXp = 0

        let newLevel = calculateLevel(newXp)

        await member.update({ last_level_reported: newLevel, xp: newXp })

        let ranks = await Rank.findAll({ order: [['level', 'DESC']], where: { guild_id: msg.guild.id } })

        if (ranks.length) {
            let correctRank = ranks.find((rank) => +rank.level <= newLevel)

            ranks.forEach((rank) => {
                if (correctRank && rank.role_id === correctRank.role_id) return

                memberToSanction.roles.remove(rank.role_id)
            })

            if (correctRank) memberToSanction.roles.add(correctRank.role_id)
        }

        return msg.reply(`${memberToSanction} now has ${newXp} XP and is on level ${newLevel}.`)
    }

    if (command === 'setlevel') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        if (args.length < 2) return msg.reply(`please specify a member and the level to set.`)

        let memberToModify = msg.mentions.members.first() || msg.guild.members.cache.find((member) => +member.id === +args[0])

        if (! memberToModify) return msg.reply(`please specify a member to modify.`)

        let newLevel = +args[1]

        if (newLevel < 0) newLevel = 0

        if (! Number.isInteger(newLevel)) return msg.reply(`please specify the member's new level.`)

        let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: memberToModify.id }}) || await Member.create({ guild_id: msg.guild.id, user_id: memberToModify.id })

        let newXp = calculateXp(newLevel)

        await member.update({ last_level_reported: newLevel, xp: newXp })

        let ranks = await Rank.findAll({ order: [['level', 'DESC']], where: { guild_id: msg.guild.id } })

        if (ranks.length) {
            let correctRank = ranks.find((rank) => +rank.level <= newLevel)

            ranks.forEach((rank) => {
                if (correctRank && rank.role_id === correctRank.role_id) return

                memberToModify.roles.remove(rank.role_id)
            })

            if (correctRank) memberToModify.roles.add(correctRank.role_id)
        }

        return msg.reply(`${memberToModify} now has ${newXp} XP and is on level ${newLevel}.`)
    }

    if (command === 'setxp') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        if (args.length < 2) return msg.reply(`please specify a member and the XP to set.`)

        let memberToModify = msg.mentions.members.first() || msg.guild.members.cache.find((member) => +member.id === +args[0])

        if (! memberToModify) return msg.reply(`please specify a member to modify.`)

        let newXp = +args[1]

        if (newXp < 0) newXp = 0

        if (! Number.isInteger(newXp)) return msg.reply(`please specify the member's new XP.`)

        let member = await Member.findOne({ where: { guild_id: msg.guild.id, user_id: memberToModify.id }}) || await Member.create({ guild_id: msg.guild.id, user_id: memberToModify.id })

        let newLevel = calculateLevel(newXp)

        await member.update({ last_level_reported: newLevel, xp: newXp })

        let ranks = await Rank.findAll({ order: [['level', 'DESC']], where: { guild_id: msg.guild.id } })

        if (ranks.length) {
            let correctRank = ranks.find((rank) => +rank.level <= newLevel)

            ranks.forEach((rank) => {
                if (correctRank && rank.role_id === correctRank.role_id) return

                memberToModify.roles.remove(rank.role_id)
            })

            if (correctRank) memberToModify.roles.add(correctRank.role_id)
        }

        return msg.reply(`${memberToModify} now has ${newXp} XP and is on level ${newLevel}.`)
    }

    if (command === 'status') {
        const res = await msg.channel.send('Ping?')

        return res.edit(`Pong! Latency is ${res.createdTimestamp - msg.createdTimestamp}ms.`)
    }

    if (command === 'token') {
        if (! msg.member.hasPermission('ADMINISTRATOR')) return

        let key = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

        await Token.create({ guild_id: msg.guild.id, key: key })

        let reply = await msg.reply(`your new token is \`${key}\`. Please keep this a secret. This message will self-destruct in 10 seconds.`)
    
        setTimeout(() => {
            reply.delete()
        }, 10000)
    }
	
	if (command === 'help' || command === 'h') {
		const exampleEmbed = {
			color: 0x87CEEB,
			//title: `Help`,
			description: `**User Commands:**
			
\`${prefix}rank <member>\` - Check a member's XP and level.
\`${prefix}leaderboard <page>\` - Display's a server-wide XP leaderboard.

**XP Management:** 

\`${prefix}reward <member> <xp>\` - Increases a member's XP.
\`${prefix}sanction <member> <xp>\` - Decreases a member's XP.
\`${prefix}setxp <member> <xp>\` - Sets a member's XP.
\`${prefix}setlevel <member> <level>\` - Sets a member's level.

**Bot Settings:**

\`${prefix}prefix\` - Sets the bot's command prefix. By default, it is ${prefix}.
\`${prefix}status\` - Check the bot's status
\`${prefix}blacklist\` - Displays a list of the guild's blacklisted channels and members.
\`${prefix}blacklist <channel or member>\` - Toggle a channel or member on the blacklist.
\`${prefix}ranks\` - Displays a list of the guild's ranks.
\`${prefix}addrank <level> <role>\` - Automatically assign a role when a member reaches a level.
\`${prefix}removerank <level or role>\` - Remove a role that is automatically assigned when a member reaches a level.
`,
			thumbnail: {
				//url: client.user.iconURL(),
			},
			timestamp: new Date(),
		};

		msg.channel.send({ embed: exampleEmbed });

	
	}
})

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (! oldState.channel && newState.channel) {
        let member = await Member.findOne({ where: { guild_id: newState.guild.id, user_id: newState.member.id }}) || await Member.create({ guild_id: newState.guild.id, user_id: newState.member.id })

        if (member.is_blacklisted) return

        let channelIsBlacklisted = await BlacklistedChannel.findOne({ where: { id: newState.channel.id } })

        if (channelIsBlacklisted) return await member.update({ joined_voice_at: null })

        await member.update({ joined_voice_at: new Date() })
    }

    if (oldState.channel && ! newState.channel) {
        let member = await Member.findOne({ where: { guild_id: oldState.guild.id, user_id: oldState.member.id }}) || await Member.create({ guild_id: oldState.guild.id, user_id: oldState.member.id })

        if (member.is_blacklisted) return

        let channelIsBlacklisted = await BlacklistedChannel.findOne({ where: { id: oldState.channel.id } })

        if (channelIsBlacklisted) return await member.update({ joined_voice_at: null })

        if (! member.joined_voice_at) return

        let duration = Math.round(new Date().getMinutes() - new Date(member.joined_voice_at).getMinutes())

        let newXp = member.xp + duration

        if (member.xp > newXp) {
            logAbnormalXpChange(member.xp, newXp, newState.member, newState.guild, 'they were rewarded for VC')
        }

        await member.update({ joined_voice_at: null, xp: newXp })
    }
})

client.login(process.env.DISCORD_BOT_TOKEN)
