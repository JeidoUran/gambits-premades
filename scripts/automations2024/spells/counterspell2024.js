export async function counterspell2024({ workflowData,workflowType,workflowCombat }) {
    const workflow = await MidiQOL.Workflow.getWorkflow(`${workflowData}`);
    if(!workflow) return;
    const gpsUuid = "fb401e12-b875-47bd-9acd-8a09639c6852";
    if(workflow.item?.flags?.["gambits-premades"]?.gpsUuid === gpsUuid) return;
    let debugEnabled = MidiQOL.safeGetGameSetting('gambits-premades', 'debugEnabled');
    let itemName = "Counterspell";
    if(!workflow.activity?.consumption.spellSlot) {
        if(debugEnabled) console.error(`${itemName} failed no activity spell slot consumption (assumed activity is not an initial spell cast)`);
        return;
    }
    let dialogId = gpsUuid;
    const lastMessage = game.messages.contents[game.messages.contents.length - 1]; // Use to hide initial spell message
    let gmUser = game.gps.getPrimaryGM();

    const castProperties = ["vocal", "somatic", "material"];
    let hasVSMProperty = castProperties.some(prop => workflow.item.system.properties.has(prop));
    let isVocalOnly = workflow.item.system.properties.has("vocal") && !workflow.item.system.properties.has("somatic") && !workflow.item.system.properties.has("material");
    let hasDeafenedStatus;
    if (!hasVSMProperty) return;

    const initialTimeLeft = Number(MidiQOL.safeGetGameSetting('gambits-premades', `${itemName} Timeout`));
    let selectedToken = workflow.token;
    let notInitialCast = false;
    let itemRoll = false;
    let csFailure = false;
    let chatContent = [];
    let saveCheck;
    let browserUser;
    let castType = workflow.item?.system?.preparation?.mode;
    let itemCardUuid = workflow.itemCardUuid;

    await initialCounterspellProcess(workflow, lastMessage, notInitialCast, selectedToken);
    
    async function initialCounterspellProcess(workflow, lastMessage, notInitialCast, selectedToken) {

        let findValidTokens = game.gps.findValidTokens({initiatingToken: selectedToken, targetedToken: null, itemName: itemName, itemType: "spell", itemChecked: null, reactionCheck: true, sightCheck: true, rangeCheck: true, rangeTotal: 60, dispositionCheck: true, dispositionCheckType: "enemy", workflowType: workflowType, workflowCombat: workflowCombat, gpsUuid: gpsUuid, sourceRules: "2024"});

        if(findValidTokens.length === 0 || !findValidTokens) return;

        for (const validTokenPrimary of findValidTokens) {
            if(lastMessage && validTokenPrimary.actor.type === "character") lastMessage.update({ whisper: gmUser });
            if(workflow.aborted === true) return;
            if(!notInitialCast) {
                hasDeafenedStatus = validTokenPrimary.document.hasStatusEffect("deafened");
                if (isVocalOnly && hasDeafenedStatus) continue;
            }
            notInitialCast = true;
            let chosenItem = validTokenPrimary.actor.items.find(i => i.flags["gambits-premades"]?.gpsUuid === gpsUuid);
            let itemProperName = chosenItem?.name;
            const dialogTitlePrimary = `${validTokenPrimary.actor.name} | ${itemProperName}`;
            const dialogTitleGM = `Waiting for ${validTokenPrimary.actor.name}'s selection | ${itemProperName}`;
            
            browserUser = game.gps.getBrowserUser({ actorUuid: validTokenPrimary.actor.uuid });

            const currentIndex = findValidTokens.indexOf(validTokenPrimary);
            const isLastToken = currentIndex === findValidTokens.length - 1;

            let subtleSpell = getSubtleSpell({validToken: validTokenPrimary});
            const { dialogSubtle = "", itemSorcery = false } = subtleSpell;

            let dialogContent = `
                <style>
                #gps-checkbox {
                    position: absolute;
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                #gps-checkbox + label {
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                }

                #gps-checkbox + label::before {
                    content: "\\f6a9";
                    font-family: "Font Awesome 5 Free";
                    font-weight: 400; /* Regular (outlined) style */
                    font-size: 20px;
                    margin-right: 5px;
                    line-height: 1;
                    vertical-align: middle;
                }

                #gps-checkbox:checked + label::before {
                    content: "\\f6a9";
                    font-family: "Font Awesome 5 Free";
                    font-weight: 900; /* Solid (filled) style */
                }
                </style>
                <div class="gps-dialog-container">
                    <div class="gps-dialog-section">
                        <div class="gps-dialog-content">
                            <div>
                                <div class="gps-dialog-flex">
                                    <p class="gps-dialog-paragraph">Would you like to use your reaction to ${itemProperName}?</p>
                                    <div id="image-container" class="gps-dialog-image-container">
                                        <img id="img_${dialogId}" src="${chosenItem.img}" class="gps-dialog-image">
                                    </div>
                                </div>
                                ${dialogSubtle}
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
    
            let content = `<span style='text-wrap: wrap;'><img src="${validTokenPrimary.actor.img}" style="width: 25px; height: auto;" /> ${validTokenPrimary.actor.name} has a reaction available for a spell triggering ${itemProperName}.</span>`;
            let chatData = { user: gmUser, content: content, roll: false, whisper: gmUser };
            let notificationMessage = await MidiQOL.socket().executeAsUser("createChatMessage", gmUser, { chatData });
    
            let result;
    
            if (MidiQOL.safeGetGameSetting('gambits-premades', 'Mirror 3rd Party Dialog for GMs') && browserUser !== gmUser) {
                let userDialogArgs = { dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source: "user",type: "multiDialog", browserUser: browserUser, notificationId: notificationMessage._id };
                
                let gmDialogArgs = { dialogTitle:dialogTitleGM,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source: "gm",type: "multiDialog", notificationId: notificationMessage._id };
            
                result = await game.gps.socket.executeAsUser("handleDialogPromises", gmUser, {userDialogArgs, gmDialogArgs});
            } else {
                result = await game.gps.socket.executeAsUser("process3rdPartyReactionDialog", browserUser, {dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source: gmUser === browserUser ? "gm" : "user",type:"singleDialog", notificationId: notificationMessage._id});
            }
                    
            const { userDecision, enemyTokenUuid, allyTokenUuid, damageChosen, genericCheck, source, type } = result;

            if (!userDecision && isLastToken) {
                if(lastMessage && validTokenPrimary.actor.type === "character") lastMessage.update({ whisper: [] });
                return workflow.aborted = false;
            }
            else if (!userDecision) {
                if(lastMessage && validTokenPrimary.actor.type === "character") lastMessage.update({ whisper: [] });
                continue;
            }
            else if (userDecision) {
                if(lastMessage && validTokenPrimary.actor.type === "character") lastMessage.update({ whisper: [] });

                hasVSMProperty = castProperties.some(prop => chosenItem.system.properties.has(prop));

                if(genericCheck) await itemSorcery?.update({"system.uses.spent" : itemSorcery.system.uses.spent + 1})

                const options = {
                    showFullCard: false,
                    createWorkflow: true,
                    versatile: false,
                    configureDialog: true,
                    targetUuids: [selectedToken.document.uuid]
                };

                if(source && source === "user") itemRoll = await game.gps.socket.executeAsUser("remoteCompleteItemUse", browserUser, { itemUuid: chosenItem.uuid, actorUuid: validTokenPrimary.actor.uuid, options: options });
                else if(source && source === "gm") itemRoll = await game.gps.socket.executeAsUser("remoteCompleteItemUse", gmUser, { itemUuid: chosenItem.uuid, actorUuid: validTokenPrimary.actor.uuid, options: options });
    
                if(!itemRoll.baseLevel && !itemRoll.castLevel && !itemRoll.checkHits && !itemRoll.itemType) continue;

                if(source && source === "user") saveCheck = await game.gps.socket.executeAsUser("gpsActivityUse", browserUser, {itemUuid: chosenItem.uuid, identifier: "syntheticSave", targetUuid: selectedToken.document.uuid});
                else if(source && source === "gm") saveCheck = await game.gps.socket.executeAsUser("gpsActivityUse", gmUser, {itemUuid: chosenItem.uuid, identifier: "syntheticSave", targetUuid: selectedToken.document.uuid});
                if(!saveCheck) continue;
                
                if (saveCheck.failedSaves.size !== 0) {
                    chatContent = `<span style='text-wrap: wrap;'>The creature failed its saving throw and was counterspelled.<br><img src="${selectedToken.actor.img}" width="30" height="30" style="border:0px"></span>`;
                }
                else {
                    chatContent = `<span style='text-wrap: wrap;'>The creature succeeded its saving throw and was not counterspelled.<br><img src="${selectedToken.actor.img}" width="30" height="30" style="border:0px"></span>`;
                    csFailure = true;
                }

                await game.gps.addReaction({actorUuid: `${validTokenPrimary.actor.uuid}`});

                await game.gps.socket.executeAsUser("replaceChatCard", gmUser, {actorUuid: validTokenPrimary.actor.uuid, itemUuid: chosenItem.uuid, chatContent: chatContent, rollData: saveCheck.saveRolls});
                
                if(csFailure) continue;

                let cprConfig = game.gps.getCprConfig({itemUuid: chosenItem.uuid});
                const { animEnabled } = cprConfig;
                if(animEnabled) {
                    new Sequence()
                    .effect()
                        .file("animated-spell-effects-cartoon.energy.beam.01")
                        .fadeIn(500)
                        .fadeOut(500)
                        .atLocation(validTokenPrimary)
                        .stretchTo(selectedToken, {offset:{x: 100, y: 0}, local: true})
                        .filter("ColorMatrix", { brightness: 0, contrast: 1 })
                        .playbackRate(0.8)
                    .play()
                }

                if((!hasVSMProperty || genericCheck) && !csFailure) {
                    if(castType !== "innate" && castType !== "atwill") await refundSpellSlot({itemCardUuid, selectedToken});
                    return workflow.aborted = true;
                }

                await secondaryCounterspellProcess(workflow, lastMessage, notInitialCast, validTokenPrimary);
                break;
            }
        }
    }

    async function secondaryCounterspellProcess(workflow, lastMessage, notInitialCast, validTokenPrimary) {

            let findValidTokens = game.gps.findValidTokens({initiatingToken: validTokenPrimary, targetedToken: null, itemName: itemName, itemType: "spell", itemChecked: null, reactionCheck: true, sightCheck: true, rangeCheck: true, rangeTotal: 60, dispositionCheck: true, dispositionCheckType: "enemy", workflowType: workflowType, workflowCombat: workflowCombat, gpsUuid: gpsUuid});

            if(findValidTokens.length === 0 || !findValidTokens) {
                if(castType !== "innate" && castType !== "atwill") await refundSpellSlot({itemCardUuid, selectedToken});
                return workflow.aborted = true;
            }

            for (const validTokenSecondary of findValidTokens) {
                let chosenItem = validTokenSecondary.actor.items.find(i => i.flags["gambits-premades"]?.gpsUuid === gpsUuid);
                let itemProperName = chosenItem?.name;
                const dialogTitlePrimary = `${validTokenSecondary.actor.name} | ${itemProperName}`;
                const dialogTitleGM = `Waiting for ${validTokenSecondary.actor.name}'s selection | ${itemProperName}`;
                browserUser = game.gps.getBrowserUser({ actorUuid: validTokenSecondary.actor.uuid });
                
                const currentIndex = findValidTokens.indexOf(validTokenSecondary);
                const isLastToken = currentIndex === findValidTokens.length - 1;

                let subtleSpell = getSubtleSpell({validToken: validTokenSecondary});
                const { dialogSubtle = "", itemSorcery = false } = subtleSpell;

                let dialogContent = `
                    <style>
                    #gps-checkbox {
                        position: absolute;
                        opacity: 0;
                        width: 0;
                        height: 0;
                    }

                    #gps-checkbox + label {
                        display: flex;
                        align-items: center;
                        cursor: pointer;
                    }

                    #gps-checkbox + label::before {
                        content: "\\f6a9";
                        font-family: "Font Awesome 5 Free";
                        font-weight: 400; /* Regular (outlined) style */
                        font-size: 20px;
                        margin-right: 5px;
                        line-height: 1;
                        vertical-align: middle;
                    }

                    #gps-checkbox:checked + label::before {
                        content: "\\f6a9";
                        font-family: "Font Awesome 5 Free";
                        font-weight: 900; /* Solid (filled) style */
                    }
                    </style>
                    <div class="gps-dialog-container">
                        <div class="gps-dialog-section">
                            <div class="gps-dialog-content">
                                <div>
                                    <div class="gps-dialog-flex">
                                        <p class="gps-dialog-paragraph">Would you like to use your reaction to ${itemProperName}?</p>
                                        <div id="image-container" class="gps-dialog-image-container">
                                            <img id="img_${dialogId}" src="${chosenItem.img}" class="gps-dialog-image">
                                        </div>
                                    </div>
                                    ${dialogSubtle}
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
    
            let content = `<span style='text-wrap: wrap;'><img src="${validTokenSecondary.actor.img}" style="width: 25px; height: auto;" /> ${validTokenSecondary.actor.name} has a reaction available for a spell triggering ${itemProperName}.</span>`;
            let chatData = { user: gmUser, content: content, roll: false, whisper: gmUser };
            let notificationMessageSecondary = await MidiQOL.socket().executeAsUser("createChatMessage", gmUser, { chatData });
    
            let result;
    
            if (MidiQOL.safeGetGameSetting('gambits-premades', 'Mirror 3rd Party Dialog for GMs') && browserUser !== gmUser) {
                let userDialogArgs = { dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenSecondary.document.uuid,source: "user",type: "multiDialog", browserUser: browserUser, notificationId: notificationMessageSecondary._id };
                
                let gmDialogArgs = { dialogTitle:dialogTitleGM,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenSecondary.document.uuid,source: "gm",type: "multiDialog", notificationId: notificationMessageSecondary._id };
            
                result = await game.gps.socket.executeAsUser("handleDialogPromises", gmUser, {userDialogArgs, gmDialogArgs});
            } else {
                result = await game.gps.socket.executeAsUser("process3rdPartyReactionDialog", browserUser, {dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenSecondary.document.uuid,source:gmUser === browserUser ? "gm" : "user",type:"singleDialog", notificationId: notificationMessageSecondary._id});
            }
                    
            const { userDecision, enemyTokenUuid, allyTokenUuid, damageChosen, genericCheck, source, type } = result;

            if (!userDecision && isLastToken) {
                if(lastMessage && validTokenPrimary.actor.type === "character") lastMessage.update({ whisper: [] });
                if(castType !== "innate" && castType !== "atwill") await refundSpellSlot({itemCardUuid, selectedToken});
                return workflow.aborted = true;
            }
            else if (!userDecision) {
                if(lastMessage) lastMessage.update({ whisper: [] });
                continue;
            }
            else if (userDecision) {
                if(lastMessage && validTokenPrimary.actor.type === "character") lastMessage.update({ whisper: [] });

                hasVSMProperty = castProperties.some(prop => chosenItem.system.properties.has(prop));

                if(genericCheck) await itemSorcery?.update({"system.uses.spent" : itemSorcery.system.uses.spent + 1})

                const options = {
                    showFullCard: false,
                    createWorkflow: true,
                    versatile: false,
                    configureDialog: true,
                    targetUuids: [validTokenPrimary.document.uuid]
                };

                if(source && source === "user") itemRoll = await game.gps.socket.executeAsUser("remoteCompleteItemUse", browserUser, { itemUuid: chosenItem.uuid, actorUuid: validTokenSecondary.actor.uuid, options: options });
                else if(source && source === "gm") itemRoll = await game.gps.socket.executeAsUser("remoteCompleteItemUse", gmUser, { itemUuid: chosenItem.uuid, actorUuid: validTokenSecondary.actor.uuid, options: options });
    
                if(!itemRoll.baseLevel && !itemRoll.castLevel && !itemRoll.checkHits && !itemRoll.itemType) continue;

                if(source && source === "user") saveCheck = await game.gps.socket.executeAsUser("gpsActivityUse", browserUser, {itemUuid: chosenItem.uuid, identifier: "syntheticSave", targetUuid: validTokenPrimary.document.uuid});
                else if(source && source === "gm") saveCheck = await game.gps.socket.executeAsUser("gpsActivityUse", gmUser, {itemUuid: chosenItem.uuid, identifier: "syntheticSave", targetUuid: validTokenPrimary.document.uuid});
                if(!saveCheck) continue;
                
                if (saveCheck.failedSaves.size !== 0) {
                    chatContent = `<span style='text-wrap: wrap;'>The creature failed its saving throw and was counterspelled.<br><img src="${validTokenPrimary.actor.img}" width="30" height="30" style="border:0px"></span>`;
                }
                else {
                    chatContent = `<span style='text-wrap: wrap;'>The creature succeeded its saving throw and was not counterspelled.<br><img src="${validTokenPrimary.actor.img}" width="30" height="30" style="border:0px"></span>`;
                    csFailure = true;
                }

                await game.gps.addReaction({actorUuid: `${validTokenSecondary.actor.uuid}`});

                await game.gps.socket.executeAsUser("replaceChatCard", gmUser, {actorUuid: validTokenSecondary.actor.uuid, itemUuid: chosenItem.uuid, chatContent: chatContent, rollData: saveCheck.saveRolls});
                

                if(csFailure === true) continue;

                let cprConfig = game.gps.getCprConfig({itemUuid: chosenItem.uuid});
                const { animEnabled } = cprConfig;
                if(animEnabled) {
                    new Sequence()
                    .effect()
                        .file("animated-spell-effects-cartoon.energy.beam.01")
                        .fadeIn(500)
                        .fadeOut(500)
                        .atLocation(validTokenSecondary)
                        .stretchTo(validTokenPrimary, {offset:{x: 100, y: 0}, local: true})
                        .filter("ColorMatrix", { brightness: 0, contrast: 1 })
                        .playbackRate(0.8)
                    .play()
                }

                if((!hasVSMProperty || genericCheck) && !csFailure) return;
                
                await initialCounterspellProcess(workflow, lastMessage, notInitialCast, validTokenSecondary);
                break;
            }
        }
    }
}

function getSubtleSpell({validToken}) {
    let subtleSpell = validToken.actor.items.some(i => i.flags["chris-premades"]?.info?.identifier === "subtleSpell" || i.identifier === "subtle-spell");
    let itemSorcery;
    let dialogSubtle = "";
    if(subtleSpell) itemSorcery = validToken.actor.items.find(i => (i.identifier === "sorcery-points" || i.identifier === "font-of-magic" || i.identifier === "metamagic-adept") && i.system.uses?.max && i.system.uses?.spent < i.system.uses?.max);

    if(itemSorcery) {
        dialogSubtle = `
            <div style="display: flex; align-items: center;">
                <input type="checkbox" id="gps-checkbox" style="vertical-align: middle;"/>
                <label for="gps-checkbox">
                    Use Subtle Spell? | ${ itemSorcery.system.uses.max - itemSorcery.system.uses.spent } ${ itemSorcery.system.uses.max - itemSorcery.system.uses.spent > 1 ? "Points" : "Point" } Remaining
                </label>
            </div>
        `;
    }

    return {dialogSubtle, itemSorcery};
}

async function refundSpellSlot({itemCardUuid, selectedToken}) {
    const useFlag = MidiQOL.getCachedChatMessage(itemCardUuid)?.getFlag("dnd5e", "use") ?? {};
    const consumed = useFlag.consumed;

    if (consumed && Array.isArray(consumed.actor)) {
        for (const usage of consumed.actor) {
            const path = usage.keyPath;
            if (path?.startsWith("system.spells.")) {
                const current = foundry.utils.getProperty(selectedToken.actor, path) ?? 0;
                await selectedToken.actor.update({ [path]: current + 1 });
            }
        }
    }
}