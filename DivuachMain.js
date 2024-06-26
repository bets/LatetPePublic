// version 20240330 - 2330

//remove wordpress css
if (location.hostname !== "localhost") {
    var styles = document.querySelectorAll('style');
    styles.forEach(function (style) {
        style.remove();
    });

    var links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(function (link) {
        if (link.getAttribute('href') !== 'https://bets.github.io/LatetPePublic/DivuachMain.css') {
            link.remove();
        }
    });
}

// CONSTANTS

//The number matches the index (place) in setQuery("select A,B..
//The commented letter matches the column in the sheet
var iColName = 0;
const nameCol = iColName++;//A
const mailCol = iColName++;//B
const monthWorkDays = iColName++;//C - only office
const kmCol = iColName++;//E
const kmPayCol = iColName++;//F
const seniorityGroupCol = iColName++;//G
const activityCol = iColName++;//J
const seniority1Col = iColName++;//K
const seniority6Col = iColName++;//L
const seniority26Col = iColName++;//M
const constNameCol = iColName++;//O
const constValCol = iColName++;//P
const cancelPayNameCol = iColName++;//Q
const cancelPayValCol = iColName;//R

function isOffice() { return !!officeAdd; }

// GET GOOGLE SHEET DATA
google.charts.load("current", { packages: ["corechart"] });
google.charts.setOnLoadCallback(function () {
    var query = new google.visualization.Query(
        `https://docs.google.com/spreadsheets/d/${sourceSheetId}/gviz/tq`
    );
    query.setQuery("select A,B,C,E,F,G,J,K,L,M,O,P,Q,R");
    query.send(handleQueryResponse);
});
var data;
function handleQueryResponse(re) {
    if (re.isError()) {
        console.log(
            `Error in query: ${re.getMessage()} ${re.getDetailedMessage()}`
        );
        return;
    }
    data = re.getDataTable();

    //CREATE
    makeSelect(getCol(nameCol, mailCol), "payCalcName", true); //and email
    makeSelect(getCol(activityCol), "activityType");
    makeSelect(getCol(seniorityGroupCol), "seniority");
    makeSelect([1, 2, 3, 4, 5, 6, 7], "activityAmount");
    makeSelect(getCol(cancelPayNameCol, cancelPayValCol), "cancelPay");

    //save first row as template
    rowClone = qs("#payCalc tbody tr").cloneNode(true);
    setNewRowNum();
    restoreFromStorage();
    addEventListenersOnce();
    addEventListeners();

    if (isOffice()) {
        setOfficeWorkDays();
    }
}

// HANDEL DATA FROM SHEETS

/**Get a column or 2 from sheet db
Return as array of {lable,val}
If only 1 column so val will be index number
*/
function getCol(col, valCol) {
    var rows = [];
    var key;
    for (let i = 0; i < data.getNumberOfRows(); i++) {
        key = getValue(i, col);
        let cell = isNaN(key) ? key?.trim() : key.toString();
        if (cell.length == 0) break;
        rows.push({
            key: key,
            val: valCol ? getValue(i, valCol) : i + 1
        });
    }
    return rows;
}

/** get value from sheet db (starts at 0 from after frozen row) */
function getValue(row, col) {
    return data.getValue(row, col) ?? "";
}

/** get const value from sheet db by key */
function getConstValue(key) {
    return getCol(constNameCol, constValCol).find((x) => x.key == key).val;
}

/** Get the data-val from the option of the chosen key */
function getValFromList(rowNum, tdClass) {
    return getListInputDataVal(`[data-rownum='${rowNum}'] .${tdClass} input`);
}
/** Get the data-val from the option of the chosen key */
function getListInputDataVal(selector) {
    let inputElement = qs(selector);
    let option = Array.from(inputElement.list.querySelectorAll("option")).find(
        (x) => x.innerText == inputElement.value
    );
    return option ? option.dataset.val : null;
}

/** Get the data-tag of an option from a list 
 * @param key {string} Name of the select option with out the tag (tag in {culy brakents})
 * @param tdClass {string} The class name togther with List is the list Id (like this #CLASSNAMEList)
 * @returns {string} the tag name
 */
function getTagFromListOption(key, tdClass) {
    let option = Array.from(qsa(`#${tdClass}List option`)).find(
        (x) => x.innerText == key
    );
    return option ? option.dataset.tag : null;
}

//#region CREATE ELEMENTS
var rowClone;
function addRow(e) {
    if (e && e.type == "keypress" && e.key != "Enter") return;
    let clone = rowClone.cloneNode(true);
    qs("#payCalc tbody").append(clone);
    let rowNum = setNewRowNum();
    addEventListeners();
    if (e && e.type == "keypress" && e.key == "Enter")//only when add new row and not for VAT row (and like)
        [...qsa("#payCalc [type='date']")].pop().focus();
    return rowNum;
}

/**
 * Remove a table row
 * @param {any} e element or event
 * @param {any} ask when true (defualt), user confirm is needed
 * @returns
 */
function removeRow(e, ask = true) {
    if (ask) if (!confirm("בטוח למחוק?")) return;
    qp("data-rownum", getRowNum(e)).remove();
    setNewRowNum();
    handelSingalActivitySup();
    addEventListeners();
    qi("totalActivityPay").innerText = sumCells(".activityPay input");
    if (isOffice()) {
        qi("totalFual").innerText = sumCells(".distance:not(.skipSum) [type=text]");
        qi("totalDiedTime").innerText = sumCells("td:not(.skipSum) .distancePay");
    } else {
        qi("totalTravelPay").innerText = sumCells(".travelPay");
        qi("totalPay").innerText = sumCells(".midSum");
    }
    handelPostActivitySumAdditions();
    if (ask) saveToStorage();
}

function setNewRowNum() {
    let i = 0;
    qsa("#payCalc tbody tr").forEach(function (e) {
        e.dataset.rownum = i++;
    });
    return i - 1;
}

/** Create a list of options to populate an input */
function makeSelect(options, target, isId) {
    if (options.length == 0) return;
    let selector = isId ? "#" : "#payCalc tbody tr .";
    let input = document.createElement("input");
    input.type = "search";

    if (!qs(selector + target).classList.contains("okEmpty"))
        input.setAttribute("placeholder", "נא לבחור"); // ▼
    input.setAttribute("list", target + "List");
    var datalist = document.createElement("datalist");
    datalist.id = target + "List";
    for (let i in options) {
        let option = document.createElement("option");

        let txt = options[i].key ?? options[i];
        if (isNaN(txt)) {
            let matches = txt.match(/\{.*?\}/);
            if (matches != null) {//matches.length > 0) {
                txt = txt.replace(matches[0], "").trim();
                option.dataset.tag = matches[0];//add a tag for special addones, for now only one tag in this format "{tag name}"
            }
        }
        option.textContent = txt;
        option.dataset.val = options[i].val ?? options[i];
        datalist.appendChild(option);
    }
    qs(selector + target).appendChild(input);
    qi("lists").appendChild(datalist);
}
//#endregion

//#region Local Storage
function saveToStorageDelay() {
    setTimeout(saveToStorage, 1000);
}
function saveToStorage() {
    qsa("#payCalc input").forEach((el) => {
        if (el.type == "checkbox") {
            if (el.checked) el.setAttribute("checked", "");
            else el.removeAttribute("checked");
        } else el.setAttribute("value", el.value);
    });
    let table = qs("#payCalc .tableContainer Table");
    var serializer = new XMLSerializer();
    var tableStr = serializer.serializeToString(table);
    localStorage.setItem("payCalcTable" + officeAdd, tableStr);
    localStorage.setItem("payCalcName" + officeAdd, qs("#payCalcName input").value);
    localStorage.setItem("payCalcSaveTime" + officeAdd, new Date());
    qi("saveInfo").hidden = false;
    displayStorageTime();
}
function clearStorage(ask = true) {
    if (ask) if (!confirm("למחוק הכל ולהתחיל מחדש?")) return;
    localStorage.removeItem("payCalcTable" + officeAdd);
    localStorage.removeItem("payCalcName" + officeAdd);
    localStorage.removeItem("payCalcSaveTime" + officeAdd);
    qs("#payCalcName input").value = "";
    qsa("#payCalc tbody tr").forEach((e) => removeRow(e, false));
    addRow();
    qi("saveInfo").hidden = true;
}
function restoreFromStorage() {
    let saved = localStorage.getItem("payCalcTable" + officeAdd);
    if (saved == null) return;
    qs("#payCalc .tableContainer").innerHTML = saved;
    qs("#payCalcName input").value = localStorage.getItem("payCalcName" + officeAdd);
    qi("saveInfo").hidden = false;
    displayStorageTime();
}
function displayStorageTime() {
    let time = new Date(localStorage.getItem("payCalcSaveTime" + officeAdd));
    qi("saveTime").innerHTML =
        new Date().getDate() == time.getDate()
            ? time.toLocaleTimeString([], { hour12: false })
            : time.toLocaleDateString('he-IL');
}
//#endregion

//#region CALCULATIONS
/** Calculate payment for activity
 Activity has 3 prices based on seniority
 Above times the amount of the activity given that day
 If tagged so add tag value 
*/
function payPerActivity(e, addSup = null) {
    let rowNum = getRowNum(e);
    let activityTypeRow = getValFromList(rowNum, "activityType");
    let seniorityCol = getValFromList(rowNum, "seniority");
    let activityAmount = getValFromList(rowNum, "activityAmount");
    let activityTypeKey = qs(`[data-rownum='${rowNum}'] .activityType input`)
        .value;

    let tag = getTagFromListOption(activityTypeKey, "activityType");
    qs(`[data-rownum='${rowNum}']`).dataset.tag = activityAmount == 1 ? tag : '';

    let isCustomActivity = activityTypeKey == "אחר";
    // cl(e.target)
    if (addSup == null && e.target.parentElement.classList.contains("activityType")) {
        if (isCustomActivity) {
            setAsCustomRow(rowNum);
        } else {
            setAsRegularRow(rowNum);
        }
        showErrorMsg();
    }

    if (
        (!activityTypeRow || !seniorityCol || !activityAmount) &&
        !isCustomActivity
    )
        return;
    let singalCost = getValue(
        parseInt(activityTypeRow) - 1,//row
        parseInt(seniorityCol) + activityCol//col
    );
    // console.log(`type ${singalCost}, Vetek ${seniorityCol}, Amount ${activityAmount}`);
    let payRowActivity = parseInt(activityAmount) * singalCost;
    if (addSup)
        payRowActivity += parseInt(getCol(constNameCol, constValCol).find((x) => x.key == tag).val);

    let cancelPay = qs(`[data-rownum='${rowNum}'] .cancelPay input`);
    if (cancelPay) { //not in office
        let reduceBy = "" == cancelPay.value ? 0 : getValFromList(rowNum, "cancelPay");
        if (reduceBy) {
            payRowActivity = payRowActivity * reduceBy;
            qs(`[data-rownum='${rowNum}'] .distance input`).value = "";
            qs(`[data-rownum='${rowNum}'] .distance input`).readOnly = true;
            payPerKm(e);
        } else
            qs(`[data-rownum='${rowNum}'] .distance input`).readOnly = false;
    } else {//only office
        if (qs(`[data-rownum='${rowNum}'] .duringOffice`) && qs(`[data-rownum='${rowNum}'] .duringOffice`).checked) { //first check is temp util add .duringOffice to page
            payRowActivity = 0;
        }
    }

    qs(`[data-rownum='${rowNum}'] .activityPay input`).value = payRowActivity;

    payAndAdditionSums();
}

function setAsCustomRow(rowNum) {
    qs(
        `[data-rownum='${rowNum}'] .activityPay input`
    ).readOnly = false;
    qs(
        `[data-rownum='${rowNum}'] .activityPay input`
    ).value = "";
    qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute(
        "placeholder",
        "שם הפעילות"
    );
    qs(`[data-rownum='${rowNum}'] .seniority input`).removeAttribute(
        "list"
    );
    qs(
        `[data-rownum='${rowNum}'] .seniority input`
    ).classList.remove("invalidList");
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = 1;
    qs(
        `[data-rownum='${rowNum}'] .activityAmount input`
    ).readOnly = true;
    qs(
        `[data-rownum='${rowNum}'] .activityAmount input`
    ).classList.remove("invalidList");
}

function setAsRegularRow(rowNum) {
    qs(
        `[data-rownum='${rowNum}'] .activityPay input`
    ).readOnly = true;
    qs(
        `[data-rownum='${rowNum}'] .activityPay input`
    ).value = 0;
    qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute(
        "placeholder",
        "נא לבחור"
    );
    qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute(
        "list",
        "seniorityList"
    );
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = "";
    qs(
        `[data-rownum='${rowNum}'] .activityAmount input`
    ).readOnly = false;
    qs(
        `[data-rownum='${rowNum}'] .activityPay input`
    ).classList.remove("invalidPattern");
}

function payAndAdditionSums() {
    qi("totalActivityPay").innerText = sumCells(".activityPay input");
    if (qi("totalPay"))//not for office
        qi("totalPay").innerText = sumCells(".midSum");

    handelPostActivitySumAdditions();
}

function handelPostActivitySumAdditions() {
    if (isOffice())//for office
    {
        handelBossCommitment();
    } else { // for not office
        handelRebateVAT();
    }
}

/**
 * Subtract bosses pre commitment if tag is with name
 * Tag: {הסכם הנהלה}
 * Only for office
 */
function handelBossCommitment() {
    let debtRow = qs('#debtRow');
    if (debtRow) {
        debtRow.remove();
        qi("totalActivityPay").innerText = sumCells(".activityPay input");
    }

    let name = qs("#payCalcName input").value;
    let debtTag = getTagFromListOption(name, 'payCalcName');
    if (debtTag == '{הסכם הנהלה}') {
        let debtValMax = getConstValue(debtTag);
        let activitySum = sumCells(".activityPay input");
        let debtVal = activitySum > debtValMax * -1 ? debtValMax : activitySum * -1;
        if (debtVal == 0) return;
        let tagName = debtTag.replace('{', '').replace('}', '');

        let rowNum = addRow();
        qs(`[data-rownum='${rowNum}']`).id = 'debtRow';
        qs(`[data-rownum='${rowNum}']`).classList.add('autoAddedRow');
        qs(`[data-rownum='${rowNum}'] .spacetime input[type=date]`).valueAsDate = new Date();
        qsa(`[data-rownum='${rowNum}'] .spacetime input[type=text]`).forEach((input) => input.value = '-');
        qs(`[data-rownum='${rowNum}'] .activityType input`).value = 'אחר';
        qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = 1;
        qs(`[data-rownum='${rowNum}'] .seniority input`).value = tagName;
        qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute("title", tagName);
        qs(`[data-rownum='${rowNum}'] .distance input`).value = '';
        qs(`[data-rownum='${rowNum}'] .activityPay input`).value = debtVal;
        qsa(`[data-rownum='${rowNum}'] input`).forEach(input => input.readOnly = true);
        qs(`[data-rownum='${rowNum}'] .seniority input`).removeAttribute("list");
        qs(`[data-rownum='${rowNum}'] .seniority input`).classList.remove("invalidList");

        qi("totalActivityPay").innerText = sumCells(".activityPay input");
    }
}

/**
 * Set expected work days by name
 * Subtract sick, vacation... days used
 */
function setOfficeWorkDays() {
    let name = qs("#payCalcName input").value;
    if (name == "") return;

    let workDays = parseInt(getCol(nameCol, monthWorkDays).find((x) => x.key.includes(name)).val);
    workDays -= parseInt(qi("vacationDays").value);
    workDays -= parseInt(qi("sickDays").value);
    workDays -= parseInt(qi("armyDays").value);
    workDays -= parseInt(qi("missDays").value);

    qi("workDays").value = workDays;
}

/**
 * Add VAT if tag is with name
 * Tags: {תוספת מע"מ חלקית} {תוספת מע"מ}
 * Not for office
 */
function handelRebateVAT() {
    //remove old if exists and reset sums
    let vatRow = qs('#vatRow');
    if (vatRow) {
        vatRow.remove();
        qi("totalActivityPay").innerText = sumCells(".activityPay input");
        qi("totalTravelPay").innerText = sumCells(".travelPay");
        qi("totalPay").innerText = sumCells(".midSum");
    }

    let name = qs("#payCalcName input").value;
    let vatSupTag = getTagFromListOption(name, 'payCalcName');
    if (vatSupTag) {
        let vatSup = vatSupTag.includes('חלקית') ? getConstValue('תוספת מע"מ חלקית') : getConstValue('תוספת מע"מ');
        let totVAT = Math.round(vatSup * (sumCells(".activityPay input") + sumCells(".travelPay")));
        let tagName = vatSupTag.replace('{', '').replace('}', '');

        let rowNum = addRow();
        qs(`[data-rownum='${rowNum}']`).id = 'vatRow';
        qs(`[data-rownum='${rowNum}']`).classList.add('autoAddedRow');
        qs(`[data-rownum='${rowNum}'] .spacetime input[type=date]`).valueAsDate = new Date();
        qsa(`[data-rownum='${rowNum}'] .spacetime input[type=text]`).forEach((input) => input.value = '-');
        qs(`[data-rownum='${rowNum}'] .activityType input`).value = 'אחר';
        qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = 1;
        qs(`[data-rownum='${rowNum}'] .seniority input`).value = tagName;
        qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute("title", tagName);
        qs(`[data-rownum='${rowNum}'] .distance input`).value = '';
        qs(`[data-rownum='${rowNum}'] .activityPay input`).value = totVAT;
        qsa(`[data-rownum='${rowNum}'] input`).forEach(input => input.readOnly = true);
        qs(`[data-rownum='${rowNum}'] .seniority input`).removeAttribute("list");
        qs(`[data-rownum='${rowNum}'] .seniority input`).classList.remove("invalidList");

        qi("totalActivityPay").innerText = sumCells(".activityPay input");
        qi("totalTravelPay").innerText = sumCells(".travelPay");
        qi("totalPay").innerText = sumCells(".midSum");
    }
}

/**
 * Check if any row tagged with {תוספת בודדת} needs to get supplement or remove supplement if more then 1 activity at same place and day
 */
function handelSingalActivitySup() {
    let groupedRows = [];
    [...qsa('#payCalc [data-rownum]')].forEach((row) => {
        let added = false;
        groupedRows.forEach((rowGroup) => {
            if (rowGroup[0].dataset.spacetime == row.dataset.spacetime) {
                added = true;
                rowGroup.push(row);
            }
        });
        if (!added)
            groupedRows.push([row]);
    });

    groupedRows.forEach((rowGroup) => {
        if (rowGroup.length == 1 && rowGroup[0].dataset.tag == "{תוספת בודדת}")
            payPerActivity(rowGroup[0], true);
        else {
            rowGroup.forEach((row) => {
                if (row.dataset.tag == "{תוספת בודדת}")
                    payPerActivity(row, false);
            });
        }
    });
}

function getRowNum(e) {
    let el = e.target ?? e;
    return el.closest("tr").dataset.rownum;
}

function sumCells(selector) {
    return Array.from(qsa(selector)).reduce(
        (sum, el) => {
            var elNum = parseInt(el.value ? el.value : el.innerText);
            if (isNaN(elNum))
                elNum = 0;
            return sum + elNum;
        },
        0
    );
}
//#endregion

//#region EVENTS
function addEventListenersOnce() {
    action("#send", "click", send);
    action("#saveI", "mouseenter,mouseleave", popSaveExplain);
    action("#clearStorageBtn", "click", clearStorage);

    if (isOffice()) {
        action("#payCalcName input", 'change', setOfficeWorkDays);
        action(".teamData [type='number']", 'change', setOfficeWorkDays);
    } else {
        action("#receipt", "change", isReceiptAttached);
        action("#receipt", "change", unhideReceiptNotice);
    }
}

function addEventListeners() {
    action(".tableContainer input", 'change', saveToStorageDelay);
    action("#addRow", "click, keypress", addRow);
    action(".removeRow", "click", removeRow);
    action(".activity input", "change", payPerActivity);

    action(".distance input", "keyup", payPerKm);
    action(".distance input", "keyup", handelPostActivitySumAdditions);
    action("tbody [type=checkbox]", "change", payPerKm);
    action("tbody [type=checkbox]", "change", handelPostActivitySumAdditions);

    action("#payCalc .activityPay", "change", payAndAdditionSums);
    action("[list]", "change", isFromList);
    action("#payCalc [type='date']", "change", checkDate);
    action(".spacetime input", "change", spacetimeUpdate);
    // must be bound after spacetimeUpdate so happends after
    action(".activity input", "change", handelSingalActivitySup);

    action("[pattern]", "change", isPatternMatch);
    action("#payCalc .notEmpty input", "change", isTextNotEmpty);
    action("#payCalcName input", 'change', handelPostActivitySumAdditions);
}

function popSaveExplain(event) {
    if (event.type === 'mouseenter') {
        qi("saveExplain").show();
    } else {
        qi("saveExplain").close();
    }
}
function spacetimeUpdate(e) {
    let rowNum = getRowNum(e.target);
    let spacetime = [...qsa(`[data-rownum='${rowNum}'] .spacetime input`)].map((x) => x.value).join();
    qs(`[data-rownum='${rowNum}']`).dataset.spacetime = spacetime;
    handelSingalActivitySup();
}
function unhideReceiptNotice() {
    qi("receiptNotice").classList.remove("hide");
}
//#endregion

//#region VALIDATIONS
function isFromList(e) {
    isFromListCheck(e.target);
}
//returns false if invalid
function isFromListCheck(el) {
    if (!el.list) return true;
    let option = Array.from(el.list.querySelectorAll("option")).find(
        (x) => x.innerText == el.value
    );
    if (option != null || (el.value == "" && el.parentElement.classList.contains("okEmpty")))
        el.classList.remove("invalidList");
    else el.classList.add("invalidList");
    showErrorMsg();
    return !el.classList.contains("invalidList");
}
function isListNotEmpty() {
    qsa("#payCalc [list]").forEach((el) => {
        if (el.value && isFromListCheck(el)) {
            el.classList.remove("invalidList");
        } else if (!(el.value == "" && el.parentElement.classList.contains("okEmpty")))
            el.classList.add("invalidList");
    });
}
function checkDate() {
    qsa("#payCalc [type='date']").forEach((el) => {
        if (el.value != "") {
            el.classList.remove("invalidDate");
        } else {
            el.classList.add("invalidDate");
        }
    });
    showErrorMsg();
}

function isAlreadySent() {
    if (qi("send").innerText == "נשלח")
        return !confirm("המידע כבר נשלח ונקלט במשרד.\n בכל זאת לשלוח שוב?");
    return false;
}
function isPatternMatch() {
    qsa("#payCalc [pattern]").forEach((el) => {
        if (el.checkValidity()) {
            el.classList.remove("invalidPattern");
        } else {
            el.classList.add("invalidPattern");
        }
    });
    showErrorMsg();
}
function isTextNotEmpty(event) {
    let els = event ? [event.target] : qsa("#payCalc .notEmpty input");
    els.forEach((el) => {
        if (el.value) {
            el.classList.remove("invalidEmpty");
        } else {
            el.classList.add("invalidEmpty");
        }
    });
    showErrorMsg();
}

//#endregion

function addStyle(clone, selector, styleName, style) {
    clone.querySelectorAll(selector).forEach((e) => {
        e.style[styleName] = style;
    });
}

async function postData(formData, webhook) {
    let submitByDay = getValue(1, constValCol);
    let today = new Date();
    let monthTab =
        today.getDate() > submitByDay
            ? today.getMonth() + 1
            : today.getMonth();
    if (monthTab == 0) monthTab = 12;
    let targetSheetRange = `${monthTab}!A1:N900`;
    formData.append("range", targetSheetRange);

    let year = today.getFullYear();
    //When new year but still reporting Dec.
    if (today.getDate() < submitByDay && today.getMonth() == 0)
        year = year - 1;
    let reportDate = `${monthTab}/${year}`;
    formData.append("reportDate", reportDate);

    const response = await fetch(webhook, {
        method: "POST",
        cache: "no-store",
        body: formData
    });
    qi("loading").classList.add("hide");
    if (response.ok) {
        qi("send").innerText = "נשלח";
        let text = await response.text(); //.json()
        console.log(text);
        alert(
            "נשלח בהצלחה!\nעותק הועבר למייל " +
            getListInputDataVal("#payCalcName input")
        );
        clearStorage(false);
    } else {
        qi("send").innerText = "שליחה";
        let json = await response.json();
        console.log(json);
        alert("לא הצלחנו לשלוח - נא לנסות שוב.\nשגיאה:\n" + json.message);
    }
}

// SELECTORS
function qs(s) {
    return document.querySelector(s);
}
function qsa(s) {
    return document.querySelectorAll(s);
}
function qi(s) {
    return document.getElementById(s);
}
function qc(s) {
    return document.getElementsByClassName(s)[0];
}
function qca(s) {
    return document.getElementsByClassName(s);
}
function qp(p, n) {
    return document.querySelector(`[${p}="${n}"]`);
}
function cl(txt) {
    console.log(txt);
}
/**
 * Add event listener to element, works with singal or many selectors, elements & events
 * @param {string} selector element selector/s, comma separated
 * @param {string} events event name/s, comma separated 
 * @param {any} func one function or function name to execute
 */
function action(selector, events, func) {
    qsa(selector).forEach(el =>
        events.replaceAll(" ", "").split(",").forEach(e => {
            el.removeEventListener(e, func);
            el.addEventListener(e, func);
        }));
}
