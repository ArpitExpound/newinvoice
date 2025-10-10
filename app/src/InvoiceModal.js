import React, { useRef } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Box,
  Text,
  Table,
  Tbody,
  Tr,
  Td,
  Image,
  HStack,
  IconButton,
} from "@chakra-ui/react";
import { DownloadIcon } from "@chakra-ui/icons";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const InvoiceModal = ({ isOpen, onClose, selectedDoc }) => {
  const invoiceRef = useRef(null);

  if (!selectedDoc) return null;

  // 🔹Extract data safely from first delivery item
  const firstDeliveryItem = selectedDoc.SalesOrders?.[0]?.DeliveryItems?.[0] || {};
  const plant = firstDeliveryItem.PlantAddress || {};
  const buyer = firstDeliveryItem.BuyerAddress || {};
  const consignee = firstDeliveryItem.ConsigneeAddress || {};
  const items = selectedDoc.Items || [];
  const so = selectedDoc.SalesOrders?.[0] || {};

  const handleDownload = async () => {
    if (!invoiceRef.current) return;
    const canvas = await html2canvas(invoiceRef.current, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Invoice_${selectedDoc.billingDocumentID}.pdf`);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl">
      <ModalOverlay />
      <ModalContent p={6}>
        <ModalHeader>Invoice Preview</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {/* Download icon */}
          <HStack mb={4} justify="flex-end">
            <IconButton
              icon={<DownloadIcon />}
              colorScheme="green"
              variant="outline"
              onClick={handleDownload}
            />
          </HStack>

          <Box ref={invoiceRef} bg="white" p={4} border="1px solid black" fontSize="sm">
            {/* ================= HEADER ================= */}
            <Table w="100%" mb={4} variant="simple" size="sm" border="1px solid black">
              <Tbody>
                <Tr>
                  <Td border="1px solid black" w="50%" p={2}>
                    <Image src="/merit_logo.jpg" alt="Merit Logo" boxSize="80px" mb={2} />
                    <Text fontWeight="bold">{plant.PlantName || "MERIT POLYMERS PRIVATE LIMITED"}</Text>
                    <Text>
                      {plant.StreetName
                        ? `${plant.StreetName}${plant.HouseNumber ? ", " + plant.HouseNumber : ""}, ${plant.CityName || ""}, ${plant.PostalCode || ""}`
                        : "Address not available"}
                    </Text>
                    <Text>GSTIN: {plant.in_GSTIdentificationNumber || null }</Text>
                    <Text>State: {plant.Region || null}</Text>
                    <Text>Email: {plant.Email || null}</Text>
                  </Td>
                  <Td border="1px solid black" p={2}>
                    <Table size="sm">
                      <Tbody>
                        <Tr>
                          <Td border="1px solid black">
                            Invoice No: <b>{selectedDoc.billingDocumentID}</b>
                          </Td>
                          <Td border="1px solid black">
                            Date: <b>{selectedDoc.BillingDocumentDate || selectedDoc.invoiceDate}</b>
                          </Td>
                        </Tr>
                        <Tr>
                          <Td border="1px solid black">
                            Mode/Terms of Payment: <b>{selectedDoc.PaymentTermsName || selectedDoc.termsOfPayment || "-"}</b>
                          </Td>
                          <Td border="1px solid black">
                            Destination: <b>{selectedDoc.destinationCountry || "-"}</b>
                          </Td>
                        </Tr>
                        <Tr>
                          <Td border="1px solid black">
                            Buyer Order No: <b>{so.PurchaseOrderByCustomer || "-"}</b>
                          </Td>
                          <Td border="1px solid black">
                            Purchase Order Date: <b>{so.CustomerPurchaseOrderDate || "-"}</b>
                          </Td>
                        </Tr>
                        <Tr>
                          <Td border="1px solid black">
                            Delivery Note No: <b>{items[0]?.ReferenceSDDocument || "-"}</b>
                          </Td>
                          <Td border="1px solid black">
                            Delivery Note Date: <b>{selectedDoc.BillingDocumentDate || "-"}</b>
                          </Td>
                        </Tr>
                        <Tr>
                          <Td border="1px solid black">
                            Dispatched Through: 
                          </Td>
                          <Td border="1px solid black">
                            Motor Vehicle No: <b>{selectedDoc.motorVehicleNo || "-"}</b>
                          </Td>
                        </Tr>
                      </Tbody>
                    </Table>
                  </Td>
                </Tr>
              </Tbody>
            </Table>

            {/* ================= CONSIGNEE / BUYER ================= */}
            <Table w="100%" mb={2} size="sm" variant="simple">
              <Tbody>
                <Tr>
                  <Td border="1px solid black" p={2}>
                    <Text fontWeight="bold">Consignee (Ship To):</Text>
                    <Text>{consignee.FullName || "-"}</Text>
                    <Text>
                      {consignee.StreetName
                        ? `${consignee.StreetName}${consignee.HouseNumber ? ", " + consignee.HouseNumber : ""}, ${consignee.CityName || ""}, ${consignee.PostalCode || ""}, ${consignee.Country || ""}`
                        : "Address not available"}
                    </Text>
                  </Td>
                  <Td border="1px solid black" p={2}>
                    <Text fontWeight="bold">Buyer (Bill To):</Text>
                    <Text>{buyer.FullName || "-"}</Text>
                    <Text>
                      {buyer.StreetName
                        ? `${buyer.StreetName}${buyer.HouseNumber ? ", " + buyer.HouseNumber : ""}, ${buyer.CityName || ""}, ${buyer.PostalCode || ""}, ${buyer.Country || ""}`
                        : "-"}
                    </Text>
                  </Td>
                </Tr>
              </Tbody>
            </Table>

            {/* ================= ITEM TABLE ================= */}
            <Table size="sm" variant="simple" border="1px solid black" w="100%" mb={2}>
              <Tbody>
                <Tr bg="gray.100" fontWeight="bold">
                  <Td border="1px solid black">Sr. No</Td>
                  <Td border="1px solid black">Material Description</Td>
                  <Td border="1px solid black">Sales Document</Td>
                  <Td border="1px solid black">Item Category</Td>
                  <Td border="1px solid black">Quantity</Td>
                  <Td border="1px solid black">Amount</Td>
                </Tr>
                {items.length > 0 ? (
                  items.map((item, index) => (
                    <Tr key={index}>
                      <Td border="1px solid black">{index + 1}</Td>
                      <Td border="1px solid black">{item.Description || "-"}</Td>
                      <Td border="1px solid black">{item.SalesDocument || "-"}</Td>
                      <Td border="1px solid black">{item.ItemCategory || "-"}</Td>
                      <Td border="1px solid black">{item.Quantity || "-"}</Td>
                      <Td border="1px solid black">{item.NetAmount || "-"}</Td>
                    </Tr>
                  ))
                ) : (
                  <Tr>
                    <Td colSpan={6} border="1px solid black" textAlign="center">
                      No item details available.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>

            {/* ================= TOTAL SECTION ================= */}
            <Text mt={4} textAlign="center" fontWeight="bold">
              *** End of Invoice ***
            </Text>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default InvoiceModal;