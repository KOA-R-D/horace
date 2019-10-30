const config = require('../config.json');
const Discord = require('discord.js');

class deleteMessageActions {
	static async sendMessageToModeration(client, message) {
		const isHoraceBot = message.author.id === client.user.id;

		const isCommand = message.content.startsWith(config.prefix);
	
		if(!(isHoraceBot || isCommand)){
			
			let embed = new Discord.RichEmbed()
				.setTitle('🟡 Warning: Message deleted 🟡')
				.setColor('#ffae42')
				.addField('Author', message.author, true)
				.addField('Channel', message.channel, true);
			
			if(message.content.length > 0){
				embed.addField('Message', message.content);
			}

			if(message.attachments.size > 0){
				embed.addField('Files attached to message:', message.attachments.values().next().value.filename);
			}
			

			client.channels.get(config.channels.moderation).send(embed);
			
		}
	}
}

module.exports = deleteMessageActions;
