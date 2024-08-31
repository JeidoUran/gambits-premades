//done
export async function sentinel({workflowData,workflowType,workflowCombat}) {
    const module = await import('../module.js');
    const helpers = await import('../helpers.js');
    const socket = module.socket;
    const workflowUuid = workflowData;
    const workflow = await MidiQOL.Workflow.getWorkflow(workflowUuid);
    let itemName = "sentinel";
    let itemProperName = "Sentinel";
    let dialogId = "sentinel";
    if(!workflow) return;
    if(workflow.item.name.toLowerCase() === itemName) return;
    let target = workflow.hitTargets.first();

    let findValidTokens = helpers.findValidTokens({initiatingToken: workflow.token, targetedToken: target, itemName: itemName, itemType: null, itemChecked: null, reactionCheck: true, sightCheck: false, rangeCheck: true, rangeTotal: 5, dispositionCheck: true, dispositionCheckType: "enemy", workflowType: workflowType, workflowCombat: workflowCombat});

    for (const validTokenPrimary of findValidTokens) {
        if (target.document.uuid === validTokenPrimary.document.uuid || workflow.token.document.disposition === target.document.disposition) continue;

        if(validTokenPrimary.id === target.id) continue;

        if(target.actor.items.find(i => i.name === itemProperName)) return;

        const dialogTitlePrimary = `${validTokenPrimary.actor.name} | ${itemProperName}`;
        const dialogTitleGM = `Waiting for ${validTokenPrimary.actor.name}'s selection | ${itemProperName}`;
        let chosenItem = validTokenPrimary.actor.items.find(i => i.name === itemProperName);
        let browserUser = MidiQOL.playerForActor(validTokenPrimary.actor);
        if (!browserUser.active) {
            browserUser = game.users?.activeGM;
        }
        const optionBackground = (document.body.classList.contains("theme-dark")) ? 'black' : 'var(--color-bg)';

        const initialTimeLeft = Number(MidiQOL.safeGetGameSetting('gambits-premades', `${itemProperName} Timeout`));

        // Check valid weapons
        let validWeapons = validTokenPrimary.actor.items.filter(item => {
            return (item.system.actionType === "mwak" && item.system.equipped === true);
        });
        if (!validWeapons.length) continue;
        
        // Sort the weapons alphabetically
        validWeapons.sort((a, b) => a.name.localeCompare(b.name));
        
        // Check for favorite weapon and put it on top
        let favoriteWeaponUuid = null;
        const favoriteWeaponIndex = validWeapons.findIndex(item => item.flags?.['midi-qol']?.oaFavoriteAttack);
        if (favoriteWeaponIndex > -1) {
            const favoriteWeapon = validWeapons.splice(favoriteWeaponIndex, 1)[0];
            favoriteWeaponUuid = favoriteWeapon.uuid;
            validWeapons.unshift(favoriteWeapon);
        }

        // Find 'Unarmed Strike' from the validWeapons array and add to end of list
        const unarmedIndex = validWeapons.findIndex(item => item.name.toLowerCase() === "unarmed strike");
        if (unarmedIndex > -1) {
            if(validWeapons[unarmedIndex]?.uuid !== favoriteWeaponUuid) {
                let unarmedStrike = validWeapons.splice(unarmedIndex, 1)[0];
                validWeapons.push(unarmedStrike);
            }
        }

        let dialogContent = `
            <style>
            #gps-favorite-checkbox {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
            }

            #gps-favorite-checkbox + label {
            display: flex;
            align-items: center;
            cursor: pointer;
            }

            #gps-favorite-checkbox + label::before {
            content: "\\2606"; /* Unicode empty star (☆) for my remembrance*/
            font-size: 30px;
            margin-right: 5px;
            line-height: 1;
            vertical-align: middle;
            }

            #gps-favorite-checkbox:checked + label::before {
                content: "\\2605"; /* Unicode filled star (★) also for my remembrance */
            }
            </style>
            <div class="gps-dialog-container">
                <div class="gps-dialog-section">
                    <div class="gps-dialog-content">
                        <p class="gps-dialog-paragraph">Would you like to use your reaction to attack using Sentinel? Choose your weapon below.</p>
                        <div>
                            <div class="gps-dialog-flex">
                                <label for="item-select_${dialogId}" class="gps-dialog-label">Weapon:</label>
                                <select id="item-select_${dialogId}" class="gps-dialog-select">
                                    ${validWeapons.map(item => `<option name="${item.img}" value="${item.uuid}" class="gps-dialog-option" style="background-color: ${optionBackground};">${item.name} ${favoriteWeaponUuid === item.uuid ? "&#9733;" : ""} ${item.system.actionType === "msak" ? "(Melee)" : item.system.actionType === "rsak" ? "(Ranged)" : item.system.actionType === "save" ? "(Save)" : ""}</option>`).join('')}
                                </select>
                                <div id="image-container" class="gps-dialog-image-container">
                                    <img id="weapon-img_${dialogId}" class="gps-dialog-image">
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; margin-top: 12px;">
                                <input type="checkbox" id="gps-favorite-checkbox" style="vertical-align: middle;"/>
                                <label for="gps-favorite-checkbox">Favorite this Option?</label>
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

        let content = `<span style='text-wrap: wrap;'><img src="${validTokenPrimary.actor.img}" style="width: 25px; height: auto;" /> ${validTokenPrimary.actor.name} has a reaction available for an attack triggering ${itemProperName}.</span>`
        let chatData = {
        user: game.users.find(u => u.isGM).id,
        content: content,
        whisper: game.users.find(u => u.isGM).id
        };
        let notificationMessage = await MidiQOL.socket().executeAsGM("createChatMessage", { chatData });

        let result;

        if (MidiQOL.safeGetGameSetting('gambits-premades', 'Mirror 3rd Party Dialog for GMs') && browserUser.id !== game.users?.activeGM.id) {
            let userDialogPromise = socket.executeAsUser("process3rdPartyReactionDialog", browserUser.id, {dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source: "user",type: "multiDialog"});
            
            let gmDialogPromise = socket.executeAsGM("process3rdPartyReactionDialog", {dialogTitle:dialogTitleGM,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source: "gm",type: "multiDialog"});
        
            result = await socket.executeAsGM("handleDialogPromises", userDialogPromise, gmDialogPromise);
        } else {
            result = await socket.executeAsUser("process3rdPartyReactionDialog", browserUser.id, {dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft,validTokenPrimaryUuid: validTokenPrimary.document.uuid,source:browserUser.isGM ? "gm" : "user",type:"singleDialog"});
        }

        const { userDecision, enemyTokenUuid, allyTokenUuid, damageChosen, selectedItemUuid, favoriteCheck, source, type } = result;

        if (!userDecision) {
            if(source === "gm" || type === "singleDialog") await socket.executeAsGM("deleteChatMessage", { chatId: notificationMessage._id });
            continue;
        }
        else if (userDecision) {
            await socket.executeAsGM("deleteChatMessage", { chatId: notificationMessage._id });
            
            if (!selectedItemUuid) {
                console.log("No weapon selected");
                continue;
            }

            let chosenWeapon = await fromUuid(selectedItemUuid);
            let favoriteWeaponCheck = favoriteWeaponUuid;
            let favoriteWeapon;
            if(favoriteWeaponCheck !== "null") favoriteWeapon = await fromUuid(favoriteWeaponCheck);
            if(favoriteCheck && favoriteWeaponCheck) {
               await chosenWeapon.setFlag("midi-qol", "oaFavoriteAttack", true);
               if (favoriteWeapon.uuid !== chosenWeapon.uuid) {
               await favoriteWeapon.unsetFlag("midi-qol", "oaFavoriteAttack");
               }
            }
            else if(favoriteCheck) {
               await chosenWeapon.setFlag("midi-qol", "oaFavoriteAttack", true);
            }

            chosenWeapon = chosenWeapon.clone({
                system: {
                    "range": {
                        "value": null,
                        "long": null,
                        "units": ""
                    }
                }
            }, { keepId: true });
            
            chosenWeapon.prepareData();
            chosenWeapon.prepareFinalAttributes();
            chosenWeapon.applyActiveEffects();

            const options = {
                showFullCard: false,
                createWorkflow: true,
                versatile: false,
                configureDialog: false,
                targetUuids: [`${workflow.token.document.uuid}`],
                workflowOptions: {
                    autoRollDamage: 'always',
                    autoRollAttack: true,
                    autoFastDamage: true
                }
            };

            let checkHits;
            Hooks.once("midi-qol.postActiveEffects", async (workflow) => {
                checkHits = workflow.hitTargets.first();
            });

            let itemRoll;
            if(source && source === "user") itemRoll = await MidiQOL.socket().executeAsUser("completeItemUse", browserUser?.id, { itemData: chosenWeapon, actorUuid: validTokenPrimary.actor.uuid, options: options });
            else if(source && source === "gm") itemRoll = await MidiQOL.socket().executeAsGM("completeItemUse", { itemData: chosenWeapon, actorUuid: validTokenPrimary.actor.uuid, options: options });
            if(itemRoll.aborted === true) continue;

            if(checkHits) {
                let effectData = [
                    {
                        "icon": `${chosenItem.img}`,
                        "origin": `${validTokenPrimary.actor.uuid}`,
                        "duration": {
                        "seconds": 1
                        },
                        "disabled": false,
                        "name": "Sentinel - Movement",
                        "changes": [
                        {
                            "key": "system.attributes.movement.all",
                            "mode": 0,
                            "value": "0",
                            "priority": 20
                        }
                        ],
                        "transfer": false
                    }
                ];

                await MidiQOL.socket().executeAsGM("createEffects", { actorUuid: target.actor.uuid, effects: effectData });
            }

            await helpers.addReaction({actorUuid: `${validTokenPrimary.actor.uuid}`});
        }
    }
}