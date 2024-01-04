// version 20240104 - 1300
// CONSTANTS
const nameCol = 0;//A
const mailCol = 1;//B
const kmCol = 2;//D
const kmPayCol = 3;//E
const seniorityGroupCol = 4;//G
const activityCol = 5;//J
const seniority1Col = 6;//K
const seniority6Col = 7;//L
const seniority26Col = 8;//M
const constNameCol = 9;//O
const constValCol = 10;//P
const cancelPayNameCol = 11;//Q
const cancelPayValCol = 12;//R

function isOffice() { return !!officeAdd; }

// GET GOOGLE SHEET DATA
google.charts.load("current", { packages: ["corechart"] });
google.charts.setOnLoadCallback(function () {
    var query = new google.visualization.Query(
        `https://docs.google.com/spreadsheets/d/${sourceSheetId}/gviz/tq`
    );
    query.setQuery("select A,B,D,E,G,J,K,L,M,O,P,Q,R");
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
    addEventListeners();
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
        qs(
            `[data-rownum='${rowNum}'] .activityPay input`
        ).readOnly = !isCustomActivity;
        qs(
            `[data-rownum='${rowNum}'] .activityPay input`
        ).value = isCustomActivity ? "" : 0;
        if (isCustomActivity) {
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
        } else {
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
        showErrorMsg();
    }

    if (
        (!activityTypeRow || !seniorityCol || !activityAmount) &&
        !isCustomActivity
    )
        return;
    let singalCost = getValue(
        parseInt(activityTypeRow) - 1,
        parseInt(seniorityCol) + 5
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
    }

    qs(`[data-rownum='${rowNum}'] .activityPay input`).value = payRowActivity;

    qi("totalActivityPay").innerText = sumCells(".activityPay input");
    if (qi("totalPay"))//not in office
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
function addEventListeners() {
    qsa("input").forEach(function (e) {
        e.addEventListener("change", () => setTimeout(saveToStorage, 1000));
    });
    qi("clearStorageBtn").addEventListener("click", clearStorage);
    qi("saveI").addEventListener("mouseenter", () => qi("saveExplain").show());
    qi("saveI").addEventListener("mouseleave", () =>
        qi("saveExplain").close()
    );
    action("#addRow", "click, keypress", addRow);
    qsa(".removeRow").forEach(function (e) {
        e.addEventListener("click", removeRow);
    });
    qs("#send").addEventListener("click", send);
    qsa(".activity input").forEach(function (e) {
        e.addEventListener("change", payPerActivity);
    });
    action(".distance input", "keyup", (e) => {
        payPerKm(e);
        handelPostActivitySumAdditions();
    });
    action("tbody [type=checkbox]", "change", (e) => {
        payPerKm(e);
        handelPostActivitySumAdditions();
    });
    action("#payCalc .activityPay", "change", (e) => {//keyup,
        qi("totalActivityPay").innerText = sumCells(
            ".activityPay input"
        );
        if (qi("totalPay"))//not for office
            qi("totalPay").innerText = sumCells(".midSum");
        //if (e.type === 'change')
        handelPostActivitySumAdditions();
    });
    qsa("[list]").forEach((e) => {
        e.addEventListener("change", isFromList);
    });
    qsa("#payCalc [type='date']").forEach((e) => {
        e.addEventListener("change", checkDate);
    });
    qsa("#payCalc .spacetime input").forEach((e) => {
        e.addEventListener("change", (el) => {
            let rowNum = getRowNum(el.target);
            let spacetime = [...qsa(`[data-rownum='${rowNum}'] .spacetime input`)].map((x) => x.value).join();
            qs(`[data-rownum='${rowNum}']`).dataset.spacetime = spacetime;
        });
    });
    // next 2 must be bound after similer selector events so happends after
    qsa(".spacetime input").forEach(function (e) {
        e.addEventListener("change", handelSingalActivitySup);
    });
    qsa(".activity input").forEach(function (e) {
        e.addEventListener("change", handelSingalActivitySup);
    });
    if (qs("#receipt"))//not for office
        qs("#receipt").addEventListener("change", isReceiptAttached);
    qsa("[pattern]").forEach((e) => {
        e.addEventListener("change", isPatternMatch);
    });
    qsa("#payCalc .notEmpty input").forEach((e) => {
        e.addEventListener("change", isTextNotEmpty);
    });
    if (qs("#receipt"))//not for office
        qi("receipt").addEventListener("change", (e) => {
            qi("receiptNotice").classList.remove("hide");
        });
    action("#payCalcName input", 'change', handelPostActivitySumAdditions);
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
 * @param {string} selector selector/s of one or more elements
 * @param {string} events event names separated by comma
 * @param {any} func function or function name to execute
 */
function action(selector, events, func) {
    qsa(selector).forEach(el =>
        events.replaceAll(" ", "").split(",").forEach(e =>
            el.addEventListener(e, func))
    );
}
