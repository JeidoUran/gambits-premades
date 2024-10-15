export async function cuttingWords({workflowData,workflowType,workflowCombat}) {
    const module = await import('../module.js');
    const socket = module.socket;
    const helpers = await import('../helpers.js');
    const workflow = await MidiQOL.Workflow.getWorkflow(workflowData);
    if(!workflow) return;
    const gpsUuid = "b352241e-5042-44a4-b632-3168ded51946";
    if(workflow.item.flags["gambits-premades"]?.gpsUuid === gpsUuid) return;
    let itemName = "Cutting Words";
    let dialogId = gpsUuid;
    let gmUser = helpers.getPrimaryGM();

    let findValidTokens = helpers.findValidTokens({initiatingToken: workflow.token, targetedToken: null, itemName: itemName, itemType: "feature", itemChecked: ["bardic inspiration"], reactionCheck: true, sightCheck: true, rangeCheck: true, rangeTotal: 60, dispositionCheck: true, dispositionCheckType: "enemy", workflowType: workflowType, workflowCombat: workflowCombat, gpsUuid: gpsUuid});
    
    let browserUser;

    for (const validTokenPrimary of findValidTokens) {
        let chosenItem = validTokenPrimary.actor.items.find(i => i.flags["gambits-premades"]?.gpsUuid === gpsUuid);
        let itemProperName = chosenItem?.name;
        const dialogTitlePrimary = `${validTokenPrimary.actor.name} | ${itemProperName}`;
        const dialogTitleGM = `Waiting for ${validTokenPrimary.actor.name}'s selection | ${itemProperName}`;
        let bardicDie = validTokenPrimary.actor.system.scale?.bard["bardic-inspiration"]?.die;
        if(!bardicDie) {
            ui.notifications.error("You must have a Bard scale for this actor named 'bardic-inspiration'")
            continue;
        }
        browserUser = helpers.getBrowserUser({ actorUuid: validTokenPrimary.actor.uuid });

        let dialogContent;
        const rollDetailSetting = MidiQOL.safeGetGameSetting('midi-qol', 'ConfigSettings').hideRollDetails;
        const initialTimeLeft = Number(MidiQOL.safeGetGameSetting('gambits-premades', `${itemName} Timeout`));

        if(workflowType === "damage") {
            if (workflow.token.document.disposition === validTokenPrimary.document.disposition) continue;

            let damageTypes = workflow.damageRolls.map(roll => roll.options.type);
            let hasHealing = damageTypes.some(type => type === "healing");
            if (hasHealing) return;
            let damageTotals = workflow.damageRolls.map(roll => roll.total);

            dialogContent = `
                <div class="gps-dialog-container">
                    <div class="gps-dialog-section">
                        <div class="gps-dialog-content">
                            <p class="gps-dialog-paragraph">Would you like to use your reaction to initiate ${itemProperName} for this ${workflowType} roll?</p>
                            <div>
                                <div class="gps-dialog-flex">
                                    <label for="damage-list" class="gps-dialog-label">Damage:</label>
                                    <ul id="damage-list" class="sortable" style="padding: 0; margin: 0; list-style-type: none;">
                                        ${damageTypes.map((name, index) => `
                                        <li draggable="true" style="padding: 6px; margin-bottom: 4px; cursor: grab; border: 1px solid #ccc;">
                                            <span class="damage-type">${name}</span>${["none", "detailsDSN", "details", "d20Only", "hitDamage", "hitCriticalDamage"].includes(rollDetailSetting) ? ` - ${damageTotals[index]} pts` : ""}
                                        </li>`).join('')}
                                    </ul>
                                    <div id="image-container" class="gps-dialog-image-container">
                                        <img id="img_${dialogId}" src="${chosenItem.img}" class="gps-dialog-image">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="gps-dialog-button-container">
                        <button id="pauseButton_${dialogId}" type="button" class="gps-dialog-button">
                            <i class="fas fa-pause" id="pauseIcon_${dialogId}" style="margin-right: 5px;"></i>Pause
                        </button>
                    </div>
                </div>
            `;
        }
        else if(workflowType === "attack") {
            if(workflow.token.document.disposition === validTokenPrimary.document.disposition) continue;

            dialogContent = `
                <div class="gps-dialog-container">
                    <div class="gps-dialog-section">
                        <div class="gps-dialog-content">
                            <div>
                                <div class="gps-dialog-flex">
                                    <p class="gps-dialog-paragraph">${["none", "detailsDSN", "details"].includes(rollDetailSetting) ? `The target rolled a ${workflow.attackTotal} to attack. ` : ""}Would you like to use your reaction to use ${itemProperName} for this ${workflowType} roll?</p>
                                    <div id="image-container" class="gps-dialog-image-container">
                                        <img id="img_${dialogId}" src="${chosenItem.img}" class="gps-dialog-image">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="gps-dialog-button-container">
                        <button id="pauseButton_${dialogId}" type="button" class="gps-dialog-button">
                            <i class="fas fa-pause" id="pauseIcon_${dialogId}" style="margin-right: 5px;"></i>Pause
                        </button>
                    </div>
                </div>
            `;
        }

        let content = `<span style='text-wrap: wrap;'><img src="${validTokenPrimary.actor.img}" style="width: 25px; height: auto;" /> ${validTokenPrimary.actor.name} has a reaction available for a save triggering ${itemProperName}.</span>`;
        let chatData = { user: gmUser, content: content, roll: false, whisper: gmUser };
        let notificationMessage = await MidiQOL.socket().executeAsUser("createChatMessage", gmUser, { chatData });

        let result;

        if (MidiQOL.safeGetGameSetting('gambits-premades', 'Mirror 3rd Party Dialog for GMs') && browserUser !== gmUser) {
            let userDialogArgs = { dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source: "user",type: "multiDialog", browserUser: browserUser, notificationId: notificationMessage._id };
            
            let gmDialogArgs = { dialogTitle:dialogTitleGM,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source: "gm",type: "multiDialog", notificationId: notificationMessage._id };
        
            result = await socket.executeAsUser("handleDialogPromises", gmUser, {userDialogArgs, gmDialogArgs});
        } else {
            result = await socket.executeAsUser("process3rdPartyReactionDialog", browserUser, {dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source: gmUser === browserUser ? "gm" : "user",type:"singleDialog", notificationId: notificationMessage._id});
        }
                
        const { userDecision, enemyTokenUuid, allyTokenUuid, damageChosen, source, type } = result;

        if (!userDecision) {
            continue;
        }
        else if (userDecision) {            
            const options = {
                showFullCard: false,
                createWorkflow: true,
                versatile: false,
                configureDialog: true,
                targetUuids: [workflow.token.document.uuid],
            };

            let itemRoll;
            if(source && source === "user") itemRoll = await MidiQOL.socket().executeAsUser("completeItemUse", browserUser, { itemData: chosenItem, actorUuid: validTokenPrimary.actor.uuid, options: options });
            else if(source && source === "gm") itemRoll = await MidiQOL.socket().executeAsUser("completeItemUse", gmUser, { itemData: chosenItem, actorUuid: validTokenPrimary.actor.uuid, options: options });

            if(!itemRoll) continue;
            let chatContent;

            await helpers.addReaction({actorUuid: `${validTokenPrimary.actor.uuid}`});

            let hasDeafened = workflow.actor.appliedEffects.find(i => i.name.toLowerCase() === "deafened");
            let charmImmunity = workflow.actor.system.traits.ci.value.has("charmed");
            
            if (charmImmunity || hasDeafened) {
                chatContent = `<span style='text-wrap: wrap;'>The creature seems to not be effected by your ${itemProperName}.<img src="${workflow.actor.img}" width="30" height="30" style="border:0px"></span>`;

                let actorPlayer = MidiQOL.playerForActor(validTokenPrimary.actor);
                let chatData = {
                    user: actorPlayer.id,
                    speaker: ChatMessage.getSpeaker({ token: validTokenPrimary }),
                    content: chatContent
                };
                ChatMessage.create(chatData);

                continue;
            }

            if(workflowType === "damage") {
                const saveSetting = workflow.options.noOnUseMacro;
                workflow.options.noOnUseMacro = true;
                let reroll;
                if(source && source === "user") reroll = await socket.executeAsUser("rollAsUser", browserUser, { rollParams: `1${bardicDie}`, type: workflowType });
                if(source && source === "gm") reroll = await socket.executeAsUser("rollAsUser", gmUser, { rollParams: `1${bardicDie}`, type: workflowType });

                let remainingReduction = reroll.total;
                let updatedRolls = [];
                let processedRolls = new Set();
                
                for (const priority of damageChosen) {
                    let rollFound = workflow.damageRolls.find(roll => roll.options.type === priority);
                
                    if (rollFound) {
                    processedRolls.add(rollFound);
                        let rollTotal = rollFound.total;
                        if (rollTotal >= remainingReduction) {
                            let modifiedRoll = await new CONFIG.Dice.DamageRoll(`${rollTotal} - ${remainingReduction}`).evaluate();
                            modifiedRoll.options = rollFound.options;
                            updatedRolls.push(modifiedRoll);
                            remainingReduction = 0;
                            break;
                        } else {
                            remainingReduction -= rollTotal;
                            let zeroRoll = await new CONFIG.Dice.DamageRoll(`${rollTotal} - ${rollTotal}`).evaluate();
                            zeroRoll.options = rollFound.options;
                            updatedRolls.push(zeroRoll);
                        }
                    }
                }
                
                workflow.damageRolls.forEach(roll => {
                    if (!processedRolls.has(roll)) {
                        updatedRolls.push(roll);
                    }
                });

                await workflow.setDamageRolls(updatedRolls);
        
                workflow.options.noOnUseMacro = saveSetting;

                chatContent = `<span style='text-wrap: wrap;'>The creature takes a cutting word, and their damage is reduced by ${reroll.total}. <img src="${workflow.token.actor.img}" width="30" height="30" style="border:0px"></span>`;

                await socket.executeAsUser("replaceChatCard", gmUser, {actorUuid: validTokenPrimary.actor.uuid, itemUuid: chosenItem.uuid, chatContent: chatContent, rollData: reroll});

                continue;
            }

            else if(workflowType === "attack") {
                let targetAC = workflow.hitTargets.first().actor.system.attributes.ac.value;
                const saveSetting = workflow.options.noOnUseMacro;
                workflow.options.noOnUseMacro = true;
                let reroll;
                if(source && source === "user") reroll = await socket.executeAsUser("rollAsUser", browserUser, { rollParams: `1${bardicDie}`, type: workflowType });
                if(source && source === "gm") reroll = await socket.executeAsUser("rollAsUser", gmUser, { rollParams: `1${bardicDie}`, type: workflowType });
                let rerollNew = await new Roll(`${workflow.attackRoll.result} - ${reroll.total}`).evaluate();

                await workflow.setAttackRoll(rerollNew);
                workflow.options.noOnUseMacro = saveSetting;

                if((workflow.attackTotal - reroll.total) < targetAC) {
                    chatContent = `<span style='text-wrap: wrap;'>The creature takes a cutting word reducing their attack by ${reroll.total}, and were unable to hit their target. <img src="${workflow.token.actor.img}" width="30" height="30" style="border:0px"></span>`;

                    await socket.executeAsUser("replaceChatCard", gmUser, {actorUuid: validTokenPrimary.actor.uuid, itemUuid: chosenItem.uuid, chatContent: chatContent, rollData: rerollNew});

                    return;
                }

                else {
                    chatContent = `<span style='text-wrap: wrap;'>The creature takes a cutting word reducing their attack by ${reroll.total}, but were still able to hit their target. <img src="${workflow.token.actor.img}" width="30" height="30" style="border:0px"></span>`;

                    await socket.executeAsUser("replaceChatCard", gmUser, {actorUuid: validTokenPrimary.actor.uuid, itemUuid: chosenItem.uuid, chatContent: chatContent, rollData: rerollNew});

                    continue;
                }
            }
        }
    }
}