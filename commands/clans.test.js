const clans = require('./clans.js');
const messageStub = require('../stub/messageStub');


test('Sends correct clans message to channel', async () => {
	// Arrange
	const message = new messageStub();

	// Act
	const responseMessage = await clans.execute(null, message);

	// Assert
	const expectedResponse = `⚔ Here is our list of KOA Clans! ⚔

🔸 **The Round Table**: All things Hard Mode by **Alex**#8758
🔸 **Bards of Academia**: All things music by **alivia_trivia**#9195
🔸 **The Fiction Faction**: Creative Writing & Story Telling by **varrictethras**#5383
🔸 **The Gathering**: Accountability by **anhero**#3771
🔸 **The Clockwork Knights**: Productivity & Efficiency through the use of Systems by **stoneybaby**#3398
🔸 **The Silver Tongues**: Language & Culture by **Dotty**#6792
🔸 **The Students**: Academics & all things Education by **erschmid**#2994
🔸 **The Wolf Pack**: On the move for Health by **QueenWolf**#5509`;

	expect(responseMessage).toBe(expectedResponse);
});
