// Reminder Bot Command List

// :white_small_square: $remind [#channel] [time until reminder e.g. 10m for 10 minutes or 10h for 10 hours] [@user] [message] - Sets up a reminder to be sent to a given channel. You can exclude the channel parameter to make it send a reminder to the same channel you set the reminder on. Example: $remind #accountability-club 10h @Austin#0008 did you get everything done today?
// :white_small_square: $natural - A swifter remind command. Use this command for more info.
// :white_small_square: $del - Choose what reminders to delete (It goes without saying please do not abuse this in ways such as deleting others' reminders)
// :white_small_square: $info - Get bot info

// 1. I think the todo command was considered a replacement for accountability station, but we still don't appear to hit the pin limit so I would agree. I think the base feature of reminding things at certain times / repetitive intervals is the key idea. 
// 2. I think having 3 types of reminders is what I see people being used; "remind to do X in 2 days",
// "remind me to do X every 5 days", "remind me to do X on july 20th". That's in order of priority, I think.
// Maybe even having a specific format for the command so you don't have to try and parse the exact language...
// but however you do it is fine haha. I think storing things in the same format in the SQLite database is definitely key,
// since Horace could be restarted 5 minutes from setting a reminder to 2 months after.
// Speaking of format, yea just ReminderBot's format seems fine. I'd also recommend limiting it to maybe a specific channel in config, like #accountability-station or something, since that's where that main purpose would arise.Thank you for taking this one on! :conquer:

// TODO Better names for variables.
// TODO "del/delete" argument.
const Discord = require('discord.js');

const config = require('../config.json');
const errors = require('../helpers/errors.js');

const Reminder = require('../databaseFiles/remindersTable.js');
const SpellChecker = require('spellchecker'); // Used to fix the typos.

// Needed when parsing the reminder.
const MONTHS_DATA = require('../data/months_data.js');
// Account for the leap years.
MONTHS_DATA['feb']['length'] = new Date(new Date().getFullYear(), 2, 0).getDate();


module.exports.execute = async (client, message, args) => {
	// Restrict command usage to accountability-station and command-center channels.
	if (!(message.channel.id === config.channels.accountability || message.channel.id === config.channels.commandcenter)) {
		return await message.channel.send(
			`Whoops, sorry, but the "remind" command is only available in <#${config.channels.accountability}> and <#${config.channels.commandcenter}>.`
		);
	}

	const currentDate = new Date();
	const whoToRemind = message.author.id;

	let whatToRemind, whenToRemind, recurring, howOftenToRemind;
	try {
		[whatToRemind, whenToRemind, recurring, howOftenToRemind] = parseReminder(args, currentDate, message);
	} catch (err) {
		console.error(err);

		if (err instanceof errors.MonthLengthValidationError) {
			return await message.channel.send(
				`Whoops! ${err.month} doesn't have ${err.days} days! Please correct the command or see \`!remind help\` for guidance!`
			);
		} else if (err instanceof errors.DateInThePastValidationError) {
			return await message.channel.send(
				'Whoops! The date you specified is in the past. Please correct the command or see `!remind help` for guidance!'
			);
		} else if (err instanceof errors.NonmatchingInputValidationError) {
			return await message.channel.send(
				'I\'m sorry, but the command you\'ve used is invalid. Please use `!remind help` for guidance on how to structure it correctly!'
			);
		}
	}

	await Reminder.sync({ force: true }).then(() => {
		return Reminder.create({
			whoToRemind: whoToRemind,
			whatToRemind: whatToRemind,
			whenToRemind: whenToRemind,
			recurring: recurring,
			howOftenToRemind: howOftenToRemind
		}).catch(err => {
			console.error('Reminder Sequelize error: ', err);
		});
	});

	let reminders = await Reminder.findAll();
	console.log(reminders);
};

function resetSecondsAndMilliseconds(date) {
	date.setMilliseconds(0);
	date.setSeconds(0);

	return date;
}

function addToDate(date, amountToAdd, whatToAdd) {
	let result = new Date(resetSecondsAndMilliseconds(date));

	switch (whatToAdd) {
	case 'minute':
	case 'minutes':
		result.setMinutes(result.getMinutes() + amountToAdd);
		break;
	case 'hour':
	case 'hours':
		result.setHours(result.getHours() + amountToAdd);
		break;
	case 'day':
	case 'days':
		result.setDate(result.getDate() + amountToAdd);
		break;
	case 'month':
	case 'months':
		result.setMonth(result.getMonth() + amountToAdd);
		break;
	default:
		throw new errors.NonmatchingInputValidationError('The unit (minutes, hours, ...) could\'nt be parsed correctly.');
	}

	return result;
}

async function confirmReminder(whatToRemind, whenToRemind, message) {
	let confirmation_message = await message.channel.send(`
Hey ${message.author.username}! I'm not perfect, so please confirm if that is correct.
Do you want me to remind you to ${whatToRemind} ${whenToRemind}? React with thumbs up or thumbs down!

**Please note that this message will disappear in 20 seconds.**`
	);

	let confirm, deny;
	[confirm, deny] = [config.emotes.confirm, config.emotes.deny];

	confirmation_message.react(confirm).then(() => confirmation_message.react(deny));

	const filter = (reaction, user) => {
		return [confirm, deny].includes(reaction.emoji.name) && user.id === message.author.id;
	};

	confirmation_message.awaitReactions(filter, { max: 1, time: 20000, errors: ['time'] })
		.then(collected => {
			const reaction = collected.first();

			confirmation_message.delete();

			if (reaction.emoji.name === confirm) {
				message.reply('I added your reminder to the database!');
			} else if (reaction.emoji.name === deny) {
				let errorMessage = 'User decided that the parsed reminder is invalid.';
				let toSend = 'yikes! Please consider trying again or use `!remind help` for guidance!';

				throw new errors.ReminderDeniedValidationError(errorMessage, toSend);
			}
		})
		.catch(err => {
			confirmation_message.delete();

			if (err instanceof errors.ReminderDeniedValidationError) {
				console.error(err);
				return message.reply(err.toSend);
			} else {
				return message.reply('you didn\'t confirm nor deny. Please try again or use `!remind help` for guidance!');
			}
		});
}


function parseReminder(unparsedArgs, currentDate, message) {
	// This might be significant later on when constructing Horace's reminding message.
	const regMy = new RegExp('my', 'i');

	// This RegExp matches reminders in the form of "!remind [me to] do X in Y minutes/hours/days/months".
	// The first group is the action to be reminded about, the second group is how many
	// minutes/hoursdays/months (determined by the third group) should pass before the reminder.
	const regOne = new RegExp('(?:me to)? *(.*) +in +((?:\\d+)|(?:a)|(?:an)) +(minutes?|hours?|days?|months?)', 'i');

	// This RegExp matches reminders in the form of "!remind [me to] do X on Y".
	// The first group is the action to be reminded about, the second group is the month,
	// and the third group is the day.
	const regTwo = new RegExp('(?:me to)? *(.*) +on +((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)) +(\\d+) *(?:st|nd|rd|th)?', 'i');

	// This RegExp matches reminders in the form of "!remind [me to] do [X] every [Y] minutes/hours/days/months".
	// The first group is the action to be remided about, and the second and third group dictate how often
	// to remind.
	const regThree = new RegExp('(?:me to)? *(.*) +every +(\\d+ )?(minutes?|hours?|days?|months?)', 'i');

	// TODO Maybe the 4th regex for reminding at an exact time?

	let toPush = '';
	let correctedInput = [];

	unparsedArgs.forEach(word => {
		// HACK SpellChecker corrects some of the month names' abbreviations (e.g. "feb" -> "fib").
		// This works around that by checking if the word to be added is in fact such abbreviation,
		// and if so, the loop continues with the next iteration.
		if (Object.keys(MONTHS_DATA).includes(word)) { correctedInput.push(word); return; }

		// Ternary operation that corrects the word if there's a typo, but leaves it as is if there's not.
		toPush = SpellChecker.isMisspelled(word) ? SpellChecker.getCorrectionsForMisspelling(word)[0] : word;

		// This might be significant later on when constructing Horace's reminding message.
		toPush = toPush.replace(regMy, 'your');

		correctedInput.push(toPush);
	});

	// We need a string to work with regexes.
	let stringInput = correctedInput.join(' ');

	let matchRegOne = stringInput.match(regOne);
	let matchRegTwo = stringInput.match(regTwo);
	let matchRegThree = stringInput.match(regThree);

	let whatToRemind, whenToRemind, recurring, howOftenToRemind;

	if (matchRegOne) {
		whatToRemind = matchRegOne[1];

		let amountToAdd = ['a', 'an'].includes(matchRegOne[2].toLowerCase()) ? 1 : parseInt(matchRegOne[2]);
		let whatToAdd = matchRegOne[3];

		whenToRemind = addToDate(currentDate, amountToAdd, whatToAdd);

		recurring = false;
		howOftenToRemind = null;

		// We need to build the confirmation message differently than in the database.
		let whenToRemindForConfirmation = 'in ' + amountToAdd + ' ' + whatToAdd;
		confirmReminder(whatToRemind, whenToRemindForConfirmation, message);
	} else if (matchRegTwo) {
		whatToRemind = matchRegTwo[1];

		let monthAbbreviation = matchRegTwo[2].slice(0, 3).toLowerCase();
		let month = MONTHS_DATA[monthAbbreviation]['number'];
		let day = matchRegTwo[3];

		if (day > MONTHS_DATA[monthAbbreviation]['length']) {
			let errorMessage = `${MONTHS_DATA[monthAbbreviation]['fullname']} doesn't have ${day} days.`;
			throw new errors.MonthLengthValidationError(errorMessage, MONTHS_DATA[monthAbbreviation]['fullname'], day);
		}

		whenToRemind = new Date(currentDate.getFullYear(), month, day, currentDate.getHours(), currentDate.getMinutes());

		if (whenToRemind - currentDate < 0) {
			throw new errors.DateInThePastValidationError('The specified date is in the past.');
		}

		recurring = false;
		howOftenToRemind = null;

		// We need to build the confirmation message differently than in the database.
		let whenToRemindForConfirmation = 'on ' + MONTHS_DATA[monthAbbreviation]['fullname'] + ' ' + day;
		confirmReminder(whatToRemind, whenToRemindForConfirmation, message);
	} else if (matchRegThree) {
		whatToRemind = matchRegThree[1];

		let amountToAdd = matchRegThree[2] ? parseInt(matchRegThree[2]) : 1;
		let whatToAdd = matchRegThree[3];
		whenToRemind = addToDate(currentDate, amountToAdd, whatToAdd);

		recurring = true;
		howOftenToRemind = [amountToAdd, whatToAdd].join(' ');

		// We need to build the confirmation message differently than in the database.
		let plural = howOftenToRemind.charAt(howOftenToRemind.length - 1) === 's' ? '' : 's';
		let whenToRemindForConfirmation = 'every ' + howOftenToRemind + plural;
		confirmReminder(whatToRemind, whenToRemindForConfirmation, message);
	} else {
		throw new errors.NonmatchingInputValidationError('The command format doesn\'t match any of the regexes.');
	}


	return [whatToRemind, whenToRemind, recurring, howOftenToRemind];
}

async function remind(client, date, reminder, catchUp = false) {
	let userToRemind = await client.fetchUser(reminder.dataValues.whoToRemind);
	let color, description;

	if (catchUp) {
		color = '#FF4500';
		description = `Whoops! Sorry for being late, I was probably down for maintenance. 😅
		Anyway, you asked me to remind you to **${reminder.dataValues.whatToRemind}**. I hope it's not too late. 🤐`;
	} else {
		color = '#FFCC00';
		description = `Hello! I'm sorry to barge in like that. 🤐
		I just wanted to remind you to **${reminder.dataValues.whatToRemind}**. Off I go. 😄`;
	}

	const remindMessage = new Discord.RichEmbed()
		.setColor(color)
		.setTitle('Reminder')
		.setDescription(description);

	userToRemind.send(remindMessage);

	if (!reminder.dataValues.recurring) {
		await Reminder.destroy({
			where: {
				id: reminder.dataValues.id
			}
		});
	} else {
		let [amountToAdd, whatToAdd] = reminder.dataValues.howOftenToRemind.split(' ');
		amountToAdd = parseInt(amountToAdd);
		await Reminder.update({ whenToRemind: addToDate(date, amountToAdd, whatToAdd) }, {
			where: {
				id: reminder.dataValues.id
			}
		});
	}

	console.log(reminder);
}

async function scanForReminders(client) {
	const currentDate = new Date();
	const reminders = await Reminder.findAll();

	let difference;
	reminders.forEach(async reminder => {
		difference = currentDate - reminder.dataValues.whenToRemind;
		if (difference > -30000) {
			remind(client, currentDate, reminder);
		}
	});
}

async function catchUp(client) {
	const currentDate = new Date();
	const reminders = await Reminder.findAll();

	let difference;
	reminders.forEach(async reminder => {
		difference = currentDate - reminder.dataValues.whenToRemind;
		if (difference > 0) {
			remind(client, currentDate, reminder, true);
		}
	});
}

module.exports.scanForReminders = scanForReminders;
module.exports.catchUp = catchUp;

module.exports.config = {
	name: 'remind',
	aliases: ['todo'],
	description: 'todo',
	usage: ['todo']
};
