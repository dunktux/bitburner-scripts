// Global variable to trigger the while loop to keep the main menu open
let running;

/**
 * @description Main looping function to show the menu for the user to interact with
 * @param {NS} ns 
 */
export async function main(ns)
{
    running = true;
    while (running)
    {
        let cloudServers = getCloudServers(ns);
        await mainPrompt(ns, cloudServers);
    }
}

/**
 * @description The main menu prompt that the user will interact with
 * @param {NS} ns 
 * @param {CloudResponse} cloudServers 
 */
async function mainPrompt(ns, cloudServers)
{
    let mainPromptHeader = cloudServers.getServerNumbers() + "\n\nPlease select an option";
    let mainChoices = 
    [
        "List Servers",
        "Purchase",
        "Upgrade",
        "Rename",
        "Delete",
        "Exit"
    ];

    if (cloudServers.serverCount == 0)
    {
        mainChoices.splice(mainChoices.indexOf("List Servers"), 1);
        mainChoices.splice(mainChoices.indexOf("Upgrade"), 1);
        mainChoices.splice(mainChoices.indexOf("Rename"), 1);
        mainChoices.splice(mainChoices.indexOf("Delete"), 1);
    }

    if (cloudServers.serverCount == ns.cloud.getServerLimit())
    {
        mainChoices.splice(mainChoices.indexOf("Purchase"), 1);
    }

    let mainPromptResult = await ns.prompt(mainPromptHeader, 
        {
            type: "select",
            choices: mainChoices
        }
    );
    
    switch(mainPromptResult)
    {
        case "List Servers":
            await listServerPrompt(ns, cloudServers);
            break;

        case "Purchase":
            await purchasePrompt(ns, cloudServers);
            break;

        case "Upgrade":
            await upgradePrompt(ns, cloudServers);
            break;
            
        case "Rename":
            await renamePrompt(ns, cloudServers);
            break;

        case "Delete":
            await deletePrompt(ns, cloudServers);
            break;
            
        case "Exit":
            running = false;
            break;
        
        default: 
            running = false;
            break;
    }
}

/**
 * @description The prompt for purchasing new servers
 * @param {NS} ns 
 * @param {CloudResponse} cloudServers 
 */
async function purchasePrompt(ns, cloudServers, promptMods = "")
{
    let purchasePromptHeader = cloudServers.getServerNumbers() + "\n\nHow many servers would you like to purchase?";
    if (promptMods != "" ) purchasePromptHeader = cloudServers.getServerNumbers() + "\n\n" + promptMods + "\nHow many servers would you like to purchase?";
    let purchasePromptResults = await ns.prompt(purchasePromptHeader, {type: "text"});
    purchasePromptResults = purchasePromptResults.toString().trim();
    let purchaseAmount = parseInt(purchasePromptResults);
    
    // Error handle purchase amount
    let purchaseLimit = ns.cloud.getServerLimit() - cloudServers.serverCount;
    if (purchasePromptResults == "") return;
    if (!isNumeric(purchasePromptResults)) return await purchasePrompt(ns, cloudServers, "You must enter a number!");
    if (purchaseAmount < 0) return await purchasePrompt(ns, cloudServers, "You must enter a positive number!");
    if (purchaseAmount > purchaseLimit) return await purchasePrompt(ns, cloudServers, "Your purchase limit is " + purchaseLimit);
    if (purchaseAmount == 0) return;

    // Get RAM amount
    let ramAmount = await ramPrompt(ns) ?? 0;
    if (ramAmount == 0) return;

    // Check player money and check if they want to continue with predicted purchase amount
    let purchaseCost = purchaseAmount * ns.cloud.getServerCost(ramAmount);

    if (ns.getPlayer().money < purchaseCost)
    {
        let prompt = await ns.prompt
        (
            "Insufficient funds for purchase!\n" +
            "\nThis will cost $" + ns.format.number(purchaseCost) +
            "\nYou have $" + ns.format.number(ns.getPlayer().money) +
            "\n\nReturn to main menu?"
        );

        if (prompt == true) return;
        else ns.exit();
    }
    else
    {
        let fundsAfterPurchase = ns.getPlayer().money - purchaseCost;
        let fundsAfterPurchaseFormatted = ns.format.number(fundsAfterPurchase);
        let prompt = await ns.prompt
        (
            "\nThis will cost $" + ns.format.number(purchaseCost) +
            "\nYou have $" + ns.format.number(ns.getPlayer().money) +
            "\nFunds after purchase: $" + fundsAfterPurchaseFormatted +
            "\n\nContinue?"
        );

        if (prompt == false) return;
    }

    // Determine server naming
    let serverName = await determineNamingConvention(ns, cloudServers, purchaseAmount);
    if (!serverName) return;

    let confirmationPromptHeader = "Confirm your purchase of " + purchaseAmount + " servers for $" + ns.format.number(purchaseCost) + "?"
    if (purchaseAmount == 1) confirmationPromptHeader = "Confirm your purchase of " + purchaseAmount + " server for $" + ns.format.number(purchaseCost) + "?"
    let confirmationPrompt = await ns.prompt(confirmationPromptHeader);
    if (confirmationPrompt == false) return;
    
    let purchasedServers = [];
    let currentIndex = serverName.startingIndex;
    for (let i = 0; i < purchaseAmount; i++)
    {
        let name = serverName.name + (currentIndex ?? "");
        let purchase = ns.cloud.purchaseServer(name, ramAmount);
        if (purchase != "") 
        {
            purchasedServers.push(name + " | " + ramAmount + " GB");
            if (currentIndex != null) currentIndex++;
        }
        if (purchase == "") ns.tprint("Server purchase failed!");
    }

    let purchasedList = purchasedServers.join("\n");
    let final = await ns.prompt("You are now the proud owner of: \n\n" + purchasedList + "\n\nReturn to the main menu?")
    if (final == false) ns.exit();
    return;
}

/**
 * @description Lists all the current cloud servers for the user
 * @param {NS} ns 
 * @param {CloudResponse} cloudServers 
 */
async function listServerPrompt(ns, cloudServers)
{
    let serverString = "";

    for (const server of cloudServers.servers)
    {
        let name = server.hostname;
        let ram = ns.getServerMaxRam(server.hostname);
        serverString += name + " | " + ram + " GB\n";
    }

    let listServerPromptHeader = 
    (
        cloudServers.getServerNumbers()
        + "\n\n"
        + serverString
        + "\nReturn to main menu?"
    );

    let prompt = await ns.prompt(listServerPromptHeader);
    if (prompt == false) ns.exit();
    return;
}

/**
 * @description The upgrade prompt for upgrading existing cloud servers
 * @param {NS} ns 
 * @param {CloudResponse} cloudServers 
 */
async function upgradePrompt(ns, cloudServers)
{
    let potentialServersToUpgrade = [];
    let upgradeAllPrompt = await ns.prompt("Would you like to upgrade the RAM of all your servers?")
    if (upgradeAllPrompt == true)
    {
        potentialServersToUpgrade = [...cloudServers.serverNames];
    }
    if (upgradeAllPrompt == false)
    {
        let serverList = [];
        let serverListNames = [];
        for (const server of cloudServers.servers)
        {
            let name = server.hostname;
            let ram = ns.getServerMaxRam(server.hostname);
            serverList.push(name + " | " + ram + " GB\n");
            serverListNames.push(name);
        }
        let singleUpgradePrompt = await ns.prompt("Please select a server to upgrade", 
            {
                type: "select",
                choices: serverList
            }
        )
        let selectedIndex = serverList.indexOf(singleUpgradePrompt.toString());
        if (selectedIndex == -1) return;
        potentialServersToUpgrade.push(serverListNames[selectedIndex]);
    }

    let ramAmount = await ramPrompt(ns);
    if (ramAmount == undefined) return;

    let upgradeCost = 0;
    let serversToUpgrade = [];
    let serversCannotUpgrade = [];
    for (const server of potentialServersToUpgrade)
    {
        let cost = ns.cloud.getServerUpgradeCost(server, ramAmount);
        if (cost == -1) serversCannotUpgrade.push(server);
        else
        {
            serversToUpgrade.push(server);
            upgradeCost += cost;
        }
    }

    if (upgradeCost == 0)
    {
        let prompt = await ns.prompt("None of your servers are eligible for this RAM upgrade\nReturn to main menu?");
        if (prompt == false) ns.exit();
        return;
    }

    let eligibleServerList = serversToUpgrade.length > 0 ? serversToUpgrade.join("\n") : "";
    let ineligibleServerList = serversCannotUpgrade.length > 0 ? serversCannotUpgrade.join("\n") : "";

    let playerMoney = ns.getPlayer().money;
    let playerMoneyFormatted = ns.format.number(ns.getPlayer().money);
    let upgradeCostFormatted = ns.format.number(upgradeCost);

    if (playerMoney < upgradeCost)
    {
        let promptHeader = 
        (
            "Insufficient funds for purchase!\n" +
            "\nThis will cost $" + upgradeCostFormatted +
            "\nYou have $" + playerMoneyFormatted +
            "\n\nReturn to main menu?"
        );
        let prompt = await ns.prompt(promptHeader);
        if (prompt == false) ns.exit();
        return;
    }

    let fundsAfterPurchase = playerMoney - upgradeCost;
    let fundsAfterPurchaseFormatted = ns.format.number(fundsAfterPurchase);

    let confirmationPromptHeader = 
    (
        (eligibleServerList != "" ? "These servers will be upgraded to " + ramAmount + " GB\n\n" + eligibleServerList + "\n" : "") +
        (ineligibleServerList != "" ? "\nThese servers are ineligible to be upgraded\n\n" + ineligibleServerList + "\n" : "") +
        "\nThis will cost $" + upgradeCostFormatted +
        "\nYou have $" + playerMoneyFormatted +
        "\nFunds after purchase: $" + fundsAfterPurchaseFormatted +
        "\n\nConfirm purchase?"
    );

    let confimrationPrompt = await ns.prompt(confirmationPromptHeader);
    if (confimrationPrompt == false) return;

    let upgradedServers = [];
    for (const server of serversToUpgrade)
    {
        let upgrade = await ns.cloud.upgradeServer(server, ramAmount);
        if (upgrade) upgradedServers.push(server + " | " + ramAmount + " GB");
    }

    let upgradedList = upgradedServers.join("\n");
    let finalPromptHeader = 
    (
        "These servers have been upgraded successfully: \n\n" +
        upgradedList +
        "\n\nReturn to main menu?"
    );

    let finalPrompt = await ns.prompt(finalPromptHeader);
    if (finalPrompt == false) ns.exit();
    return;
}

/**
 * @description The prompt for renaming existing cloud servers
 * @param {NS} ns 
 * @param {CloudResponse} cloudServers 
 */
async function renamePrompt(ns, cloudServers)
{

    let renamePromptHeader = "Select a server to rename";
    let renamePrompt = await ns.prompt(renamePromptHeader, 
    {
        type: "select",
        choices: cloudServers.serverNames

    });

    if (renamePrompt == "" || renamePrompt == null) return;
    let serverToRename = renamePrompt.toString().trim();

    let rename = await determineNamingConvention(ns, cloudServers, 1);
    if (!rename) return;

    let renameText = rename.name + (rename.startingIndex ?? "");
    let renameOperation = ns.cloud.renameServer(serverToRename, renameText);

    let finalPromptHeader =
    (
    (renameOperation ?
    "Successfully renamed " + serverToRename + " to " + renameText :
    "Failed to rename " + serverToRename + " to " + renameText) +
    "\n\nReturn to main menu?"
    );

    let finalPrompt = await ns.prompt(finalPromptHeader);
    if (finalPrompt == false) ns.exit();
    return;
}

/**
 * @description The prompt for deleting existing cloud servers
 * @param {NS} ns 
 * @param {CloudResponse} cloudServers 
 */
async function deletePrompt(ns, cloudServers)
{

    let deletePromptHeader = "Select a server to delete";
    let deletePrompt = await ns.prompt(deletePromptHeader, 
    {
        type: "select",
        choices: cloudServers.serverNames

    });

    if (deletePrompt == "" || deletePrompt == null) return;
    let serverToDelete = deletePrompt.toString().trim();

    let confirmationPromptHeader = "Are you sure you want to delete " + serverToDelete + "?";
    let confirmationPrompt = await ns.prompt(confirmationPromptHeader);
    if (confirmationPrompt == false) return;

    let deleteOperation = ns.cloud.deleteServer(serverToDelete);

    let finalPromptHeader =
    (
    (deleteOperation ?
    "Successfully deleted " + serverToDelete :
    "Failed to delete " + serverToDelete) +
    "\n\nReturn to main menu?"
    );

    let finalPrompt = await ns.prompt(finalPromptHeader);
    if (finalPrompt == false) ns.exit();
    return;
}

/**
 * @description The prompt for verifying amount of RAM the user has chosen
 * @param {NS} ns 
 */
async function ramPrompt(ns, promptMods = "")
{
    let ramPromptHeader = "Please enter the desired RAM per server";
    if (promptMods != "" ) ramPromptHeader = promptMods + "\nPlease enter the desired RAM per server";
    let ramPromptResults = await ns.prompt(ramPromptHeader, {type: "text"});
    ramPromptResults = ramPromptResults.toString().trim();
    let ramAmount = parseInt(ramPromptResults);
    
    let ramLimit = ns.cloud.getRamLimit();
    if (ramPromptResults == "") return;
    if (!isNumeric(ramPromptResults)) return await ramPrompt(ns, "You must enter a number!");
    if (ramAmount < 0) return await ramPrompt(ns, "You must enter a positive number!");
    if (ramAmount > ramLimit) return await ramPrompt(ns, "The RAM limit per server is " + ramLimit + " GB");
    if (ramAmount == 0) return;
    if (!isPowerOfTwo(ramAmount))
    {
        let closest = getClosestPowersOfTwo(ramAmount);

        let choices = [
            closest.lower.toString(),
            closest.upper.toString()
        ];

        let result = await ns.prompt(
            ramAmount + " GB is not a valid RAM amount.\n\nPlease select the closest valid amount:",
            {
                type: "select",
                choices: choices
            }
        );

        result = result.toString().trim();
        ramAmount = parseInt(result);
    }

    return ramAmount;
}

 /** 
 * @description The prompt for choosing a prefix for the name of a server
 * @param {NS} ns 
 * @param {CloudResponse} cloudServers 
 */
async function prefixPrompt(ns, cloudServers)
{
    // Loop through current servers and find prefixes - if none, return
    /** @type {{prefix: string, number: number|null, trailingHyphen: boolean}} */
    let choice = {prefix: "", number: null, trailingHyphen: false};
    /** @type {{prefix: string, number: number|null, trailingHyphen: boolean}[]} */
    let prefixes = [];
    if (cloudServers.serverCount > 0)
    {
        for (const server of cloudServers.serverNames)
        {
            // let prefix = server.match(/^\D+/)[0];
            let prefix = parseServerName(server);
            if (!prefixes.some(existing =>
                existing.prefix == prefix.prefix &&
                existing.trailingHyphen == prefix.trailingHyphen
            ))
            {
                prefixes.push(prefix);
            }
        }

    }
    else return choice;

    // Prompt that prefixes have been detected - ask if want to use an existing prefix
    let prefixPromptHeader = "Prefixes have been detected on your server names\nWould you like to use a prefix?";
    let prefixPromptResults = await ns.prompt(prefixPromptHeader);
    if (prefixPromptResults == false) return choice;
    
    // Prompt player to choose a prefix
    let prefixNames = prefixes.map(prefix => prefix.prefix + (prefix.trailingHyphen ? "-#" : "#"));
    prefixNames.push("No Prefix");
    let prefixChoicePromptHeader = "Please select a prefix";
    let prefixChoicePromptResult = await ns.prompt(prefixChoicePromptHeader, 
        {
            type: "select",
            choices: prefixNames
        }
    );
    
    // No prefix was selected, returning empty choice
    if (prefixChoicePromptResult == "No Prefix") return choice;

    // Find matching prefix object from selection
    let selectedIndex = prefixNames.indexOf(prefixChoicePromptResult.toString());

    if (selectedIndex >= 0 && selectedIndex < prefixes.length)
    {
        let selectedPrefix = prefixes[selectedIndex];

        let proposedName =
            selectedPrefix.prefix +
            (selectedPrefix.trailingHyphen ? "-" : "") +
            "1";

        let detectedPrefix =
            detectExistingPrefix(ns, cloudServers, proposedName);

        if (detectedPrefix)
        {
            choice = detectedPrefix;
        }
    }

    return choice;
}

 /** 
 * @description The prompt for the user to choose a name for the server
 * @param {NS} ns 
 */
async function namePrompt(ns, promptMods = "")
{
    let namePromptHeader = "Please enter a server name";
    if (promptMods != "" ) namePromptHeader = promptMods + "\nPlease enter a server name";
    let namePromptResults = await ns.prompt(namePromptHeader, {type: "text"});
    return namePromptResults;
}

 /** 
 * @description The prompt for user to select if they want a trailing hyphen on their server name
 * @param {NS} ns 
 */
async function trailingHyphenPrompt(ns, name)
{
    let trailingHyphenPromptHeader = "Use a trailing hyphen for the server name? (ex: " + name + "-#)";
    let trailingHyphenResults = await ns.prompt(trailingHyphenPromptHeader);
    return trailingHyphenResults === true;
}

 /** 
 * @description The prompt for the user to select if they would like a numeric labeling for their server - used if purchasing a single server
 * @param {NS} ns 
 */
async function numericLabelingPrompt(ns, name, hyphen)
{
    let numericLabelingPromptHeader = "Add numeric labeling for the server names? (ex: " + name + (hyphen ? "-" : "") + "1)";
    let numericLabelingResults = await ns.prompt(numericLabelingPromptHeader);
    return numericLabelingResults === true;
}

 /** 
 * @description The function responsible for walking through naming conventions of a server and will ouptut a final name
 * @param {NS} ns 
 * @param {CloudResponse} cloudServers 
 * @returns {Promise<void | {name: string, startingIndex: number|null}>}
 */
async function determineNamingConvention(ns, cloudServers, purchaseAmount)
{
    // Determine server naming
    /** @type {{prefix: string, number: number|null, trailingHyphen: boolean}} */
    let prefixChoice = await prefixPrompt(ns, cloudServers);
    let prefixAndName = false;
    let name = "";
    let trailingHyphen = false;
    let serverIndex = null;

    // User chose a prefix here, prompt for more information
    if (prefixChoice.prefix != "")
    {
        trailingHyphen = prefixChoice.trailingHyphen;
        if (prefixChoice.number != null) serverIndex = prefixChoice.number;

        // Ask if user wants to append a name to the prefix they choise
        let prefixAndNamePromptHeader = "Chosen prefix: " + prefixChoice.prefix + (trailingHyphen ? "-" : "") + "\n\nAppend a name to the prefix?";
        let prefixAndNamePromptResults = await ns.prompt(prefixAndNamePromptHeader);

        // Branch for appending name
        if (prefixAndNamePromptResults == true)
        {
            prefixAndName = true;
            name = (await namePrompt(ns)).toString();

            // User entered a name to append
            if (name != "")
            {
                // Ask for trailing hyphen on name
                trailingHyphen = await trailingHyphenPrompt(ns, (prefixChoice.prefix + name));

                // Detect if entered name and trailing hyphen response match any existing prefixes
                let proposedName = prefixChoice.prefix + name + (trailingHyphen ? "-" : "") + "1";
                let prefixDetection = detectExistingPrefix(ns, cloudServers, proposedName);

                // No prefixes detected, ask if numeric labeling is desired if purchasing a single server
                if (prefixDetection == false)
                {
                    if (purchaseAmount > 1) serverIndex = 1;
                    if (purchaseAmount == 1)
                    {
                        let decision = await numericLabelingPrompt(ns, (prefixChoice.prefix + name), trailingHyphen);
                        serverIndex = decision ? 1 : null;
                    }
                }
                // Prefix detected, so we'll use prefix instead
                else
                {
                    prefixChoice = prefixDetection;
                    trailingHyphen = prefixDetection.trailingHyphen;
                    serverIndex = prefixDetection.number;
                }
                
            }

            // User didn't enter a name to append or they clicked the X button, so revert to selected prefix
            if (name == "") prefixAndName = false;
        }
    }

    // No prefix was selected or no existing prefixes were detected among purchased servers, use normal naming flow
    if (prefixChoice.prefix == "")
    {
        name = (await namePrompt(ns)).toString();
        // No name was entered if name == "", so we'll abandon the flow if so
        if (name == "") return;
        // Ask for trailing hyphen on the name
        trailingHyphen = await trailingHyphenPrompt(ns, name);
        // Ask if numeric labeling is desired if purchasing a single server 
        if (purchaseAmount > 1) serverIndex = 1;
        if (purchaseAmount == 1)
        {
            let decision = await numericLabelingPrompt(ns, name, trailingHyphen);
            serverIndex = decision ? 1 : null;
        }

        // Build proposed name and double check prefixes again
        let proposedName = name + (trailingHyphen ? "-" : "") + (serverIndex ?? "");
        let detectedPrefix = detectExistingPrefix(ns, cloudServers, proposedName);
        if (detectedPrefix)
        {
            name = "";
            prefixChoice = detectedPrefix;
            trailingHyphen = detectedPrefix.trailingHyphen;
            serverIndex = detectedPrefix.number;
        }
    }

    // Finally, build final starting name
    let finalName = 
    {
        name: prefixChoice.prefix + name + (trailingHyphen ? "-" : ""),
        startingIndex: serverIndex
    };
    return finalName;
}

/**
 * @description Gets cloud servers that the user has
 * @param {NS} ns 
 * @returns {CloudResponse}
 */
function getCloudServers(ns)
{
    let servers = ns.cloud.getServerNames();
    if (!servers?.length)
    {
        return new CloudResponse(ns);
    }

    let response = new CloudResponse(ns);
    for (const server of servers)
    {
        response.addServer(server);
    }

    return response;
}

/**
 * @description Returns a boolean if a value is numeric or not
 * @param {any} value 
 * @returns 
 */
function isNumeric(value) 
{
    return /^-?\d+$/.test(value);
}

/**
 * @description Parses a server name to assist in determining a prefix pattern
 * @param {string} name 
 * @returns {{prefix: string, number: number|null, trailingHyphen: boolean}}
 */
function parseServerName(name)
{
    let match = name.match(/^(.*?)(\d+)$/);

    if (!match)
    {
        return {
            prefix: name,
            number: null,
            trailingHyphen: false
        };
    }

    let trailingHyphen = match[1].endsWith("-");

    return {
        prefix: match[1].replace(/-$/, ""),
        number: Number(match[2]),
        trailingHyphen: trailingHyphen
    };
}

/**
 * @description Used to detect if the users current list of cloud servers has a prefix pattern in the name
 * @param {NS} ns
 * @param {CloudResponse} cloudServers
 * @param {string} name
 * @returns {false | {prefix: string, number: number|null, trailingHyphen: boolean}}
 */
function detectExistingPrefix(ns, cloudServers, name)
{
    let target = parseServerName(name);

    let highestNumber = null;

    for (const server of cloudServers.serverNames)
    {
        let parsedServer = parseServerName(server);

        if (
            parsedServer.prefix == target.prefix &&
            parsedServer.trailingHyphen == target.trailingHyphen
        )
        {
            if (
                parsedServer.number != null &&
                (highestNumber == null || parsedServer.number > highestNumber)
            )
            {
                highestNumber = parsedServer.number;
            }
        }
    }

    if (highestNumber == null)
    {
        return false;
    }

    return {
        prefix: target.prefix,
        number: highestNumber + 1,
        trailingHyphen: target.trailingHyphen
    };
}

/**
 * @description Returns a boolean if the number is a power of two
 * @param {number} number 
 * @returns {boolean}
 */
function isPowerOfTwo(number)
{
    return number > 0 && Number.isInteger(Math.log2(number));
}

/**
 * @description Used by RAM prompt to get the closest amount of RAM a user can purchase if they did not enter a valid amount
 * @param {number} number 
 * @returns {{lower: number, upper: number}}
 */
function getClosestPowersOfTwo(number)
{
    let lower = Math.pow(2, Math.floor(Math.log2(number)));
    let upper = Math.pow(2, Math.ceil(Math.log2(number)));

    return {
        lower: lower,
        upper: upper
    };
}

// Class to hold information about cloud servers the player has
class CloudResponse 
{
    /**
     * 
     * @param {NS} ns 
     */
    constructor(ns,)
    {
        this.ns = ns;

        /**
         * @param {string[]} serverNames
         * @param {Set<Server>} servers
         * @param {number} serverCount
         */
        this.serverNames = [];
        this.servers = new Set();
        this.serverCount = 0;
    }

    addServer(server)
    {
        this.serverNames.push(server);
        this.servers.add(this.ns.getServer(server));
        this.serverCount++;
    }

    getServerNumbers()
    {
        let response = "";
        if (!this.serverNames?.length)
        {
            response = "You have no cloud servers"
            return response;
        }
        if (this.serverNames.length == 1)
        {
            response = "You have " + this.serverNames.length + " cloud server";
            return response;
        }
        if (this.serverNames.length == this.ns.cloud.getServerLimit())
        {
            response = "You have " + this.serverNames.length + " cloud servers, the maximum amount";
            return response;
        }

        response = "You have " + this.serverNames.length + " cloud servers";
        return response;
    }
}