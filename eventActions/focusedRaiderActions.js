const config = require('../config.json');

class focusedRaiderActions {

	static async giveRole(reaction, user){
		// Ensure we're in the proper channel and using the proper reaction
		if(reaction.message.channel.id == config.channels.chooseroles && reaction._emoji.id == config.emotes.hocReaction) {
			if(reaction.message.id != config.focusedRaiderMessageId) return;
			// Create the role variable
			const role = reaction.message.guild.roles.find(role => role.id === config.roles.focusedraider);

			// Create a GuildMember object from passed in user, and add role
			await reaction.message.guild.fetchMember(user).then(activeMember => activeMember.addRole(role));
		}
	}

	static async removeRole(reaction, user){
		// Ensure we're in the proper channel and using the proper reaction
		if(reaction.message.channel.id == config.channels.chooseroles && reaction._emoji.id == config.emotes.hocReaction) {

			if(reaction.message.id != config.focusedRaiderMessageId) return;

			// Create the role variable
			const role = reaction.message.guild.roles.find(role => role.id === config.roles.focusedraider);

			// Create a GuildMember object from passed in user, adn remove role
			await reaction.message.guild.fetchMember(user).then(activeMember => activeMember.removeRole(role));
		}
	}
}

module.exports = focusedRaiderActions;
