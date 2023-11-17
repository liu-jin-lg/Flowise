import { useContext, useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'

import { Button, ClickAwayListener, Paper, Popper } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconArrowsMaximize, IconDatabaseImport, IconEraser, IconFileUpload, IconMessage, IconX } from '@tabler/icons'

// project import
import { cloneDeep, omit } from 'lodash'
import { useSelector } from 'react-redux'
import { flowContext } from 'store/context/ReactFlowContext'
import { StyledFab } from 'ui-component/button/StyledFab'
import MainCard from 'ui-component/cards/MainCard'
import Transitions from 'ui-component/extended/Transitions'
import ChatExpandDialog from './ChatExpandDialog'
import { ChatMessage } from './ChatMessage'

// api
import chatflowsApi from 'api/chatflows'
import chatmessageApi from 'api/chatmessage'

// Hooks
import useApi from 'hooks/useApi'
import useConfirm from 'hooks/useConfirm'
import useNotifier from 'utils/useNotifier'

// Const
import { closeSnackbar as closeSnackbarAction, enqueueSnackbar as enqueueSnackbarAction } from 'store/actions'
import { FLOWISE_CREDENTIAL_ID } from 'store/constant'

export const ChatPopUp = ({ chatflowid }) => {
    const theme = useTheme()
    const { confirm } = useConfirm()
    const dispatch = useDispatch()

    useNotifier()
    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [open, setOpen] = useState(false)
    const [textFile, setTextFile] = useState(null)
    const [showExpandDialog, setShowExpandDialog] = useState(false)
    const [expandDialogProps, setExpandDialogProps] = useState({})

    const anchorRef = useRef(null)
    const prevOpen = useRef(open)
    const textFileInputRef = useRef(null)

    const canvas = useSelector((state) => state.canvas)
    const [canvasDataStore, setCanvasDataStore] = useState(canvas)
    const [chatflow, setChatflow] = useState(null)

    const { reactFlowInstance, setReactFlowInstance } = useContext(flowContext)

    const updateChatflowApi = useApi(chatflowsApi.updateChatflow)

    const handleClose = (event) => {
        if (anchorRef.current && anchorRef.current.contains(event.target)) {
            return
        }
        setOpen(false)
    }

    const handleToggle = () => {
        setOpen((prevOpen) => !prevOpen)
    }

    const expandChat = () => {
        const props = {
            open: true,
            chatflowid: chatflowid
        }
        setExpandDialogProps(props)
        setShowExpandDialog(true)
    }

    const resetChatDialog = () => {
        const props = {
            ...expandDialogProps,
            open: false
        }
        setExpandDialogProps(props)
        setTimeout(() => {
            const resetProps = {
                ...expandDialogProps,
                open: true
            }
            setExpandDialogProps(resetProps)
        }, 500)
    }

    const clearChat = async () => {
        const confirmPayload = {
            title: `Clear Chat History`,
            description: `Are you sure you want to clear all chat history?`,
            confirmButtonName: 'Clear',
            cancelButtonName: 'Cancel'
        }
        const isConfirmed = await confirm(confirmPayload)

        if (isConfirmed) {
            try {
                const chatId = localStorage.getItem(`${chatflowid}_INTERNAL`)
                await chatmessageApi.deleteChatmessage(chatflowid, { chatId, chatType: 'INTERNAL' })
                localStorage.removeItem(`${chatflowid}_INTERNAL`)
                resetChatDialog()
                enqueueSnackbar({
                    message: 'Succesfully cleared all chat history',
                    options: {
                        key: new Date().getTime() + Math.random(),
                        variant: 'success',
                        action: (key) => (
                            <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                                <IconX />
                            </Button>
                        )
                    }
                })
            } catch (error) {
                const errorData = error.response.data || `${error.response.status}: ${error.response.statusText}`
                enqueueSnackbar({
                    message: errorData,
                    options: {
                        key: new Date().getTime() + Math.random(),
                        variant: 'error',
                        persist: true,
                        action: (key) => (
                            <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                                <IconX />
                            </Button>
                        )
                    }
                })
            }
        }
    }

    const openFileSelectDialog = () => {
        textFileInputRef.current.click()
    }

    const handleFileChange = async (e) => {
        if (!e.target.files) return
        if (reactFlowInstance) {
            const nodes = reactFlowInstance.getNodes().map((node) => {
                const nodeData = cloneDeep(node.data)
                if (Object.prototype.hasOwnProperty.call(nodeData.inputs, FLOWISE_CREDENTIAL_ID)) {
                    nodeData.credential = nodeData.inputs[FLOWISE_CREDENTIAL_ID]
                    nodeData.inputs = omit(nodeData.inputs, [FLOWISE_CREDENTIAL_ID])
                }
                node.data = {
                    ...nodeData,
                    selected: false
                }
                return node
            })

            if (e.target.files.length === 1) {
                const file = e.target.files[0]
                const { name } = file

                const reader = new FileReader()
                reader.onload = (evt) => {
                    if (!evt?.target?.result) {
                        return
                    }
                    const { result } = evt.target
                    const value = result + `,filename:${name}`

                    let editFlag = false
                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i]
                        if (node.data.inputs.txtFile) {
                            if (!editFlag) {
                                node.data.inputs.txtFile = value
                                editFlag = true
                            } else {
                                nodes.splice(i, 1)
                                i--
                            }
                        }
                    }

                    const rfInstanceObject = reactFlowInstance.toObject()
                    rfInstanceObject.nodes = nodes
                    const flowData = JSON.stringify(rfInstanceObject)
                    const updateBody = {
                        name: chatflow.name,
                        flowData
                    }

                    updateChatflowApi.request(chatflow.id, updateBody)
                    e.target.value = ''
                }
                reader.readAsDataURL(file)
            } else if (e.target.files.length > 0) {
                let files = Array.from(e.target.files).map((file) => {
                    const reader = new FileReader()
                    const { name } = file

                    return new Promise((resolve) => {
                        reader.onload = (evt) => {
                            if (!evt?.target?.result) {
                                return
                            }
                            const { result } = evt.target
                            const value = result + `,filename:${name}`
                            resolve(value)
                            setTextFile(value)
                        }

                        reader.readAsDataURL(file)
                    })
                })

                Promise.all(files).then((res) => {
                    let editFlag = false
                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i]
                        if (node.data.inputs.txtFile) {
                            if (!editFlag) {
                                node.data.inputs.txtFile = JSON.stringify(res)
                                editFlag = true
                            } else {
                                nodes.splice(i, 1)
                                i--
                            }
                        }
                    }

                    const rfInstanceObject = reactFlowInstance.toObject()
                    rfInstanceObject.nodes = nodes
                    const flowData = JSON.stringify(rfInstanceObject)
                    const updateBody = {
                        name: chatflow.name,
                        flowData
                    }

                    updateChatflowApi.request(chatflow.id, updateBody)
                    e.target.value = ''
                })
            }
        }
    }

    useEffect(() => {
        setCanvasDataStore(canvas)
    }, [canvas])

    useEffect(() => setChatflow(canvasDataStore.chatflow), [canvasDataStore.chatflow])

    useEffect(() => {
        if (prevOpen.current === true && open === false) {
            anchorRef.current.focus()
        }
        prevOpen.current = open

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, chatflowid])

    return (
        <>
            <StyledFab
                sx={{ position: 'absolute', right: 20, top: 20 }}
                ref={anchorRef}
                size='small'
                color='secondary'
                aria-label='chat'
                title='Chat'
                onClick={handleToggle}
            >
                {open ? <IconX /> : <IconMessage />}
            </StyledFab>
            <input
                type='file'
                multiple
                hidden
                accept='.txt, .html, .aspx, .asp, .cpp, .c, .cs, .css, .go, .h, .java, .js, .less, .ts, .php, .proto, .python, .py, .rst, .ruby, .rb, .rs, .scala, .sc, .scss, .sol, .sql, .swift, .markdown, .md, .tex, .ltx, .vb, .xml'
                ref={textFileInputRef}
                onChange={(e) => handleFileChange(e)}
            />
            <StyledFab
                sx={{ position: 'absolute', right: 80, top: 20 }}
                onClick={openFileSelectDialog}
                size='small'
                color='primary'
                aria-label='upload'
                title='Upload QA File'
            >
                <IconFileUpload />
            </StyledFab>
            {open && (
                <StyledFab
                    sx={{ position: 'absolute', right: 140, top: 20 }}
                    onClick={clearChat}
                    size='small'
                    color='error'
                    aria-label='clear'
                    title='Clear Chat History'
                >
                    <IconEraser />
                </StyledFab>
            )}
            {open && (
                <StyledFab
                    sx={{ position: 'absolute', right: 200, top: 20 }}
                    onClick={expandChat}
                    size='small'
                    color='primary'
                    aria-label='expand'
                    title='Expand Chat'
                >
                    <IconArrowsMaximize />
                </StyledFab>
            )}
            {open && (
                <StyledFab
                    sx={{ position: 'absolute', right: 260, top: 20 }}
                    onClick={expandChat}
                    size='small'
                    color='primary'
                    aria-label='save'
                    title='Save Chat History To DB'
                >
                    <IconDatabaseImport />
                </StyledFab>
            )}
            <Popper
                placement='bottom-end'
                open={open}
                anchorEl={anchorRef.current}
                role={undefined}
                transition
                disablePortal
                popperOptions={{
                    modifiers: [
                        {
                            name: 'offset',
                            options: {
                                offset: [40, 14]
                            }
                        }
                    ]
                }}
                sx={{ zIndex: 1000 }}
            >
                {({ TransitionProps }) => (
                    <Transitions in={open} {...TransitionProps}>
                        <Paper>
                            <ClickAwayListener onClickAway={handleClose}>
                                <MainCard border={false} elevation={16} content={false} boxShadow shadow={theme.shadows[16]}>
                                    <ChatMessage chatflowid={chatflowid} open={open} />
                                </MainCard>
                            </ClickAwayListener>
                        </Paper>
                    </Transitions>
                )}
            </Popper>
            <ChatExpandDialog
                show={showExpandDialog}
                dialogProps={expandDialogProps}
                onClear={clearChat}
                onCancel={() => setShowExpandDialog(false)}
            ></ChatExpandDialog>
        </>
    )
}

ChatPopUp.propTypes = { chatflowid: PropTypes.string }
